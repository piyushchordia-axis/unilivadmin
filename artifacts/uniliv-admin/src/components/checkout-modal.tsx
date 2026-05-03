import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getGetResidentQueryKey,
  getGetResidentLedgerQueryKey,
  getGetResidentsQueryKey,
  type ResidentDto,
  type LedgerEntryDto,
} from "@workspace/api-client-react";
import { FormModal } from "@/components/ui/form-modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api-fetch";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  resident: ResidentDto;
  ledger: LedgerEntryDto[];
}

export function CheckoutModal({ open, onOpenChange, resident, ledger }: CheckoutModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const dues = ledger.filter((l) => !l.isPaid).reduce((s, l) => s + (l.amount || 0), 0);

  const [checkoutDate, setCheckoutDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = React.useState("");
  const [keyReturned, setKeyReturned] = React.useState(true);
  const [roomConditionNote, setRoomConditionNote] = React.useState("");
  const [deductions, setDeductions] = React.useState(0);
  const [refundAmount, setRefundAmount] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCheckoutDate(new Date().toISOString().split("T")[0]);
      setReason("");
      setKeyReturned(true);
      setRoomConditionNote("");
      setDeductions(0);
      setRefundAmount((resident.securityDeposit || 0) - 0);
    }
  }, [open, resident]);

  React.useEffect(() => {
    setRefundAmount((resident.securityDeposit || 0) - deductions);
  }, [deductions, resident.securityDeposit]);

  const onConfirm = async () => {
    setSubmitting(true);
    try {
      await apiFetch(`/residents/${resident.id}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          checkoutDate,
          reason,
          deductions,
          refundAmount,
          keyReturned,
          roomConditionNote,
        }),
      });
      toast({ title: "Resident checked out" });
      qc.invalidateQueries({ queryKey: getGetResidentQueryKey(resident.id) });
      qc.invalidateQueries({ queryKey: getGetResidentLedgerQueryKey(resident.id) });
      qc.invalidateQueries({ queryKey: getGetResidentsQueryKey() });
      onOpenChange(false);
      setLocation("/residents");
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Check Out Resident"
      onSave={onConfirm}
      isSaving={submitting}
      saveLabel="Confirm Checkout"
    >
      <div className="space-y-4">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Final Outstanding Dues</p>
            <p className="text-2xl font-display font-bold text-destructive">₹{dues.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <div>
          <Label>Checkout Date *</Label>
          <Input type="date" value={checkoutDate} onChange={(e) => setCheckoutDate(e.target.value)} data-testid="input-checkout-date" />
        </div>
        <div>
          <Label>Reason</Label>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex items-center justify-between border rounded-lg p-3">
          <Label>Key Returned</Label>
          <Switch checked={keyReturned} onCheckedChange={setKeyReturned} data-testid="switch-key-returned" />
        </div>
        <div>
          <Label>Room Condition Note</Label>
          <Textarea rows={2} value={roomConditionNote} onChange={(e) => setRoomConditionNote(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Deductions (₹)</Label>
            <Input type="number" value={deductions} onChange={(e) => setDeductions(Number(e.target.value))} data-testid="input-deductions" />
          </div>
          <div>
            <Label>Refund Amount (₹)</Label>
            <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value))} data-testid="input-refund" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Auto-suggested refund = Security Deposit (₹{(resident.securityDeposit || 0).toLocaleString("en-IN")}) - Deductions
        </p>
      </div>
    </FormModal>
  );
}

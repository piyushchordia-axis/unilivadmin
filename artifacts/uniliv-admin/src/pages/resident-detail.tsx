import * as React from "react";
import {
  useGetResident,
  getGetResidentQueryKey,
  useGetResidentLedger,
  getGetResidentLedgerQueryKey,
  useGetResidentPayments,
  getGetResidentPaymentsQueryKey,
  useGetComplaints,
  getGetComplaintsQueryKey,
  useCreateLedgerEntry,
  useCreatePayment,
  type LedgerEntryDto,
  type PaymentDto,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FormModal } from "@/components/ui/form-modal";
import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Phone,
  Mail,
  MessageSquare,
  Receipt,
  AlertCircle,
  LogOut,
  Plus,
  FileText,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CheckoutModal } from "@/components/checkout-modal";
import jsPDF from "jspdf";

const LEDGER_TYPES = ["RENT", "UTILITY", "FOOD", "LAUNDRY", "PENALTY", "ADJUSTMENT", "DEPOSIT", "INCENTIVE"];
const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE"];

export default function ResidentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: residentRes, isLoading: residentLoading } = useGetResident(id, {
    query: { queryKey: getGetResidentQueryKey(id), enabled: !!id },
  });
  const { data: ledgerRes } = useGetResidentLedger(id, {
    query: { queryKey: getGetResidentLedgerQueryKey(id), enabled: !!id },
  });
  const { data: paymentsRes } = useGetResidentPayments(id, {
    query: { queryKey: getGetResidentPaymentsQueryKey(id), enabled: !!id },
  });
  const { data: complaintsRes } = useGetComplaints(
    {},
    { query: { queryKey: getGetComplaintsQueryKey({}), enabled: !!id } }
  );

  const resident = residentRes?.data;
  const ledger = ledgerRes?.data || [];
  const payments = paymentsRes?.data || [];
  const complaints = (complaintsRes?.data || []).filter((c) => c.residentId === id);

  const [ledgerModalOpen, setLedgerModalOpen] = React.useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  if (residentLoading) {
    return <div className="space-y-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!resident) return <div>Resident not found</div>;

  const sortedLedger = [...ledger].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  let running = 0;
  const ledgerWithBalance = sortedLedger.map((e) => {
    const isCredit = e.amount < 0 || e.isPaid || e.type === "INCENTIVE" || e.type === "DEPOSIT";
    const debit = !isCredit ? Math.abs(e.amount) : 0;
    const credit = isCredit ? Math.abs(e.amount) : 0;
    running += debit - credit;
    return { ...e, debit, credit, balance: running };
  });
  const outstanding = ledger.filter((l) => !l.isPaid).reduce((s, l) => s + (l.amount || 0), 0);
  const totalPaid = payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + (p.amount || 0), 0);

  const generateAgreement = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Tenancy Agreement", 20, 20);
    doc.setFontSize(11);
    let y = 40;
    [
      `Resident: ${resident.name}`,
      `Property: ${resident.propertyName || "—"}`,
      `Room: ${resident.roomNumber || "—"}`,
      `Check-in: ${resident.checkInDate || "—"}`,
      `Monthly Rent: Rs ${resident.monthlyRent || 0}`,
      `Security Deposit: Rs ${resident.securityDeposit || 0}`,
    ].forEach((line) => { doc.text(line, 20, y); y += 8; });
    window.open(doc.output("bloburl"), "_blank");
  };

  const generateReceipt = (p: PaymentDto) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Payment Receipt", 20, 20);
    doc.setFontSize(11);
    let y = 40;
    [
      `Resident: ${resident.name}`,
      `Date: ${new Date(p.createdAt).toLocaleDateString()}`,
      `Amount: Rs ${p.amount.toLocaleString("en-IN")}`,
      `Mode: ${p.mode}`,
      `Reference: ${p.reference || "—"}`,
      `Status: ${p.status}`,
    ].forEach((line) => { doc.text(line, 20, y); y += 8; });
    window.open(doc.output("bloburl"), "_blank");
  };

  return (
    <div className="space-y-6">
      <Link href="/residents">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" data-testid="link-back-residents">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Residents
        </Button>
      </Link>

      <div className="flex justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar name={resident.name} src={resident.photo || undefined} className="h-20 w-20" fallbackClassName="text-2xl" />
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-primary">{resident.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {resident.propertyName && <Badge variant="secondary">{resident.propertyName}</Badge>}
              {resident.roomNumber && <Badge variant="outline">Room {resident.roomNumber}</Badge>}
              <StatusBadge status={resident.status} />
            </div>
            <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {resident.phone}</span>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {resident.email}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => toast({ title: "Coming soon" })} data-testid="button-send-message">
          <MessageSquare className="w-4 h-4 mr-2" /> Send Message
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPaymentModalOpen(true)} data-testid="button-record-payment">
          <Receipt className="w-4 h-4 mr-2" /> Record Payment
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast({ title: "Coming soon" })} data-testid="button-raise-complaint">
          <AlertCircle className="w-4 h-4 mr-2" /> Raise Complaint
        </Button>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCheckoutOpen(true)} data-testid="button-checkout">
          <LogOut className="w-4 h-4 mr-2" /> Check Out
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Outstanding Balance</p>
            <p className={`text-2xl font-display font-bold ${outstanding > 0 ? "text-destructive" : "text-primary"}`}>
              ₹{outstanding.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Total Paid</p>
            <p className="text-2xl font-display font-bold text-success">₹{totalPaid.toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Plan</p>
            <p className="text-2xl font-display font-bold text-primary">{resident.planType || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Check-in Date</p>
            <p className="text-lg font-display font-bold text-primary mt-1">
              {resident.checkInDate ? new Date(resident.checkInDate).toLocaleDateString() : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-surface">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="complaints">Complaints</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-display font-semibold text-primary mb-2">Personal Info</h3>
                <Field label="Name" value={resident.name} />
                <Field label="DOB" value={resident.dob} />
                <Field label="Gender" value={resident.gender} />
                <Field label="College" value={resident.college} />
                <Field label="Course" value={resident.course} />
                <Field label="Dietary" value={(resident.dietaryPref || []).join(", ")} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-display font-semibold text-primary mb-2">Parent / Emergency</h3>
                <Field label="Parent Name" value={resident.parentName} />
                <Field label="Parent Phone" value={resident.parentPhone} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardContent className="p-4 space-y-2">
                <h3 className="font-display font-semibold text-primary mb-2">Accommodation</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Property" value={resident.propertyName} />
                  <Field label="Room" value={resident.roomNumber} />
                  <Field label="Plan" value={resident.planType} />
                  <Field label="Monthly Rent" value={resident.monthlyRent ? `₹${resident.monthlyRent.toLocaleString("en-IN")}` : null} />
                  <Field label="Security Deposit" value={resident.securityDeposit ? `₹${resident.securityDeposit.toLocaleString("en-IN")}` : null} />
                  <Field label="Check-in" value={resident.checkInDate} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <Card className={`mb-4 ${outstanding > 0 ? "bg-destructive/5 border-destructive/20" : "bg-success/5 border-success/20"}`}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Outstanding Balance</p>
                <p className={`text-3xl font-display font-bold ${outstanding > 0 ? "text-destructive" : "text-success"}`}>
                  ₹{outstanding.toLocaleString("en-IN")}
                </p>
              </div>
              <Button onClick={() => setLedgerModalOpen(true)} className="bg-accent hover:bg-accent/90 text-white" data-testid="button-add-ledger">
                <Plus className="w-4 h-4 mr-2" /> Add Entry
              </Button>
            </CardContent>
          </Card>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader className="bg-surface/50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerWithBalance.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No entries</TableCell></TableRow>
                ) : (
                  ledgerWithBalance.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{new Date(e.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{e.type}</Badge></TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell className="text-right text-destructive font-mono">{e.debit ? `₹${e.debit.toLocaleString("en-IN")}` : "—"}</TableCell>
                      <TableCell className="text-right text-success font-mono">{e.credit ? `₹${e.credit.toLocaleString("en-IN")}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">₹{e.balance.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-6 space-y-4">
          <DataTable
            columns={[
              { accessorKey: "createdAt", header: "Date", cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleDateString() },
              { accessorKey: "amount", header: "Amount", cell: ({ row }: any) => `₹${row.original.amount.toLocaleString("en-IN")}` },
              { accessorKey: "mode", header: "Mode", cell: ({ row }: any) => <Badge variant="secondary">{row.original.mode}</Badge> },
              { accessorKey: "status", header: "Status", cell: ({ row }: any) => <StatusBadge status={row.original.status} /> },
              { accessorKey: "reference", header: "Reference", cell: ({ row }: any) => <span className="font-mono text-xs">{row.original.reference || "—"}</span> },
              {
                id: "actions",
                header: "",
                cell: ({ row }: any) => (
                  <Button size="sm" variant="ghost" onClick={() => generateReceipt(row.original)} data-testid={`button-receipt-${row.original.id}`}>
                    <Download className="w-3.5 h-3.5 mr-1" /> Receipt
                  </Button>
                ),
              },
            ] as any}
            data={payments}
          />
          <Card>
            <CardContent className="p-4">
              <h3 className="font-display font-semibold text-primary mb-2">Generate Payment Link</h3>
              <div className="flex gap-2">
                <Input placeholder="Amount" type="number" />
                <Button variant="outline">Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Razorpay integration requires API keys. Contact admin.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="complaints" className="mt-6">
          <DataTable
            columns={[
              { accessorKey: "ticketNo", header: "Ticket", cell: ({ row }: any) => <span className="font-mono text-xs">{row.original.ticketNo}</span> },
              { accessorKey: "title", header: "Title" },
              { accessorKey: "category", header: "Category" },
              { accessorKey: "priority", header: "Priority", cell: ({ row }: any) => <StatusBadge status={row.original.priority} /> },
              { accessorKey: "status", header: "Status", cell: ({ row }: any) => <StatusBadge status={row.original.status} /> },
              { accessorKey: "createdAt", header: "Date", cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleDateString() },
            ] as any}
            data={complaints}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "Aadhar", collected: false },
              { name: "College ID", collected: false },
              { name: "Photo ID", collected: false },
              { name: "Agreement", collected: false },
            ].map((doc) => (
              <Card key={doc.name}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-primary">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.collected ? "Collected" : "Missing"}</p>
                    </div>
                  </div>
                  <StatusBadge status={doc.collected ? "ACTIVE" : "PENDING"} />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4">
            <Button onClick={generateAgreement} variant="outline" data-testid="button-generate-agreement">
              <FileText className="w-4 h-4 mr-2" /> Generate Agreement
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <AddLedgerModal open={ledgerModalOpen} onOpenChange={setLedgerModalOpen} residentId={id} />
      <AddPaymentModal open={paymentModalOpen} onOpenChange={setPaymentModalOpen} residentId={id} />
      <CheckoutModal open={checkoutOpen} onOpenChange={setCheckoutOpen} resident={resident} ledger={ledger} />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className="text-sm text-primary font-medium">{value || "—"}</p>
    </div>
  );
}

function AddLedgerModal({ open, onOpenChange, residentId }: { open: boolean; onOpenChange: (o: boolean) => void; residentId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mut = useCreateLedgerEntry();
  const [type, setType] = React.useState("RENT");
  const [amount, setAmount] = React.useState(0);
  const [description, setDescription] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");

  React.useEffect(() => {
    if (open) { setType("RENT"); setAmount(0); setDescription(""); setDueDate(""); }
  }, [open]);

  const onSave = async () => {
    try {
      await mut.mutateAsync({ id: residentId, data: { type, amount: Number(amount), description, dueDate: dueDate || undefined } });
      toast({ title: "Entry added" });
      qc.invalidateQueries({ queryKey: getGetResidentLedgerQueryKey(residentId) });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  return (
    <FormModal open={open} onOpenChange={onOpenChange} title="Add Ledger Entry" onSave={onSave} isSaving={mut.isPending} saveLabel="Add Entry">
      <div className="space-y-4">
        <div>
          <Label>Type *</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEDGER_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Amount (₹) *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} data-testid="input-ledger-amount" />
        </div>
        <div>
          <Label>Description *</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
    </FormModal>
  );
}

function AddPaymentModal({ open, onOpenChange, residentId }: { open: boolean; onOpenChange: (o: boolean) => void; residentId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const mut = useCreatePayment();
  const [amount, setAmount] = React.useState(0);
  const [mode, setMode] = React.useState("CASH");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (open) { setAmount(0); setMode("CASH"); setReference(""); setNotes(""); }
  }, [open]);

  const onSave = async () => {
    try {
      await mut.mutateAsync({ id: residentId, data: { amount: Number(amount), mode, reference: reference || undefined, notes: notes || undefined } });
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: getGetResidentPaymentsQueryKey(residentId) });
      qc.invalidateQueries({ queryKey: getGetResidentLedgerQueryKey(residentId) });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  return (
    <FormModal open={open} onOpenChange={onOpenChange} title="Record Payment" onSave={onSave} isSaving={mut.isPending} saveLabel="Record Payment">
      <div className="space-y-4">
        <div>
          <Label>Amount (₹) *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} data-testid="input-payment-amount" />
        </div>
        <div>
          <Label>Mode *</Label>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </FormModal>
  );
}

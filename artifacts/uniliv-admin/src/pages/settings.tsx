import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { usePermissions } from "@/lib/use-permissions";
import { useToast } from "@/hooks/use-toast";

const COMPLAINT_CATEGORIES = ["ELECTRICAL","PLUMBING","HOUSEKEEPING","INTERNET","SECURITY","FOOD","LAUNDRY","OTHER"];

function GeneralTab() {
  return (
    <Card>
      <CardHeader><CardTitle>General</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium">Organization</label><Input defaultValue="UNILIV Co-Living" /></div>
          <div><label className="text-sm font-medium">Currency</label><Input defaultValue="INR" disabled /></div>
          <div><label className="text-sm font-medium">Timezone</label><Input defaultValue="Asia/Kolkata" disabled /></div>
          <div><label className="text-sm font-medium">Support Email</label><Input defaultValue="support@uniliv.com" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function SLATab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery<{ data: Array<{ id: string; category: string; slaHours: number }> }>({
    queryKey: ["/settings/sla"], queryFn: () => apiFetch("/settings/sla"),
  });
  const update = useMutation({
    mutationFn: ({ category, slaHours }: { category: string; slaHours: number }) =>
      apiFetch(`/settings/sla/${category}`, { method: "PUT", body: JSON.stringify({ slaHours }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/settings/sla"] }); toast({ title: "SLA updated" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });
  const map = new Map((data?.data || []).map((r) => [r.category, r.slaHours]));
  return (
    <Card>
      <CardHeader><CardTitle>Complaint SLA Configuration</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Category</th><th>SLA (hours)</th><th /></tr></thead>
          <tbody>
            {COMPLAINT_CATEGORIES.map((c) => (
              <SLARow key={c} category={c} hours={map.get(c) ?? 24} canEdit={canEdit} onSave={(h) => update.mutate({ category: c, slaHours: h })} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SLARow({ category, hours, canEdit, onSave }: { category: string; hours: number; canEdit: boolean; onSave: (h: number) => void }) {
  const [val, setVal] = React.useState(hours);
  React.useEffect(() => setVal(hours), [hours]);
  return (
    <tr className="border-b">
      <td className="py-2">{category}</td>
      <td><Input type="number" value={val} onChange={(e) => setVal(Number(e.target.value))} disabled={!canEdit} className="w-32" /></td>
      <td className="text-right">{canEdit && <Button size="sm" variant="outline" onClick={() => onSave(val)} disabled={val === hours}>Save</Button>}</td>
    </tr>
  );
}

function RoutingTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: routings } = useQuery<{ data: any[] }>({ queryKey: ["/settings/routing"], queryFn: () => apiFetch("/settings/routing") });
  const { data: properties } = useQuery<{ data: any[] }>({ queryKey: ["/properties"], queryFn: () => apiFetch("/properties") });
  const { data: users } = useQuery<{ data: any[] }>({ queryKey: ["/users"], queryFn: () => apiFetch("/users") });
  const [propertyId, setPropertyId] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [assignedTo, setAssignedTo] = React.useState("");

  const create = useMutation({
    mutationFn: () => apiFetch("/settings/routing", { method: "POST", body: JSON.stringify({ propertyId, category, assignedTo }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/settings/routing"] }); toast({ title: "Routing rule added" }); setPropertyId(""); setCategory(""); setAssignedTo(""); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/settings/routing/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/settings/routing"] }),
  });

  const userMap = new Map((users?.data || []).map((u: any) => [u.id, u.name]));
  const propMap = new Map((properties?.data || []).map((p: any) => [p.id, p.name]));

  return (
    <Card>
      <CardHeader><CardTitle>Complaint Routing Rules</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="grid grid-cols-4 gap-2 items-end">
            <div><label className="text-xs">Property</label>
              <Select value={propertyId} onValueChange={setPropertyId}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(properties?.data || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><label className="text-xs">Category</label>
              <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{COMPLAINT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><label className="text-xs">Assignee</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{(users?.data || []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <Button onClick={() => create.mutate()} disabled={!propertyId || !category || !assignedTo}>Add Rule</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Property</th><th>Category</th><th>Assignee</th><th /></tr></thead>
          <tbody>
            {(routings?.data || []).map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2">{propMap.get(r.propertyId) || r.propertyId}</td>
                <td>{r.category}</td>
                <td>{userMap.get(r.assignedTo) || r.assignedTo}</td>
                <td className="text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Remove</Button>}</td>
              </tr>
            ))}
            {!(routings?.data?.length) && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No routing rules</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function NotificationsTab() {
  const TYPES = [
    { key: "COMPLAINT_SLA_BREACH", label: "Complaint SLA breach" },
    { key: "PAYMENT_OVERDUE", label: "Payment overdue (daily 9am)" },
    { key: "LEAVE_APPROVAL_PENDING", label: "Leave approval pending" },
    { key: "INDENT_APPROVAL_PENDING", label: "Indent approval pending" },
    { key: "LOW_STOCK", label: "Low stock" },
    { key: "DOCUMENT_EXPIRY", label: "Vendor document expiry (30 days)" },
    { key: "LEASE_RENEWAL", label: "Lease renewal (60 days)" },
  ];
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("uniliv_notif_settings") || "{}"); } catch { return {}; }
  });
  const toggle = (k: string) => {
    const next = { ...enabled, [k]: !(enabled[k] ?? true) };
    setEnabled(next);
    localStorage.setItem("uniliv_notif_settings", JSON.stringify(next));
  };
  return (
    <Card>
      <CardHeader><CardTitle>Notification Types</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {TYPES.map((t) => {
            const on = enabled[t.key] ?? true;
            return (
              <div key={t.key} className="flex items-center justify-between p-3 border rounded">
                <div><div className="font-medium text-sm">{t.label}</div><div className="text-xs text-muted-foreground">{t.key}</div></div>
                <Button variant={on ? "default" : "outline"} size="sm" onClick={() => toggle(t.key)}>{on ? "Enabled" : "Disabled"}</Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsTab() {
  const { data } = useQuery<{ data: Array<{ name: string; enabled: boolean; configured: boolean }> }>({
    queryKey: ["/settings/integrations"], queryFn: () => apiFetch("/settings/integrations"),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(data?.data || []).map((i) => (
            <div key={i.name} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                {i.configured ? <Check className="w-5 h-5 text-success" /> : <X className="w-5 h-5 text-muted-foreground" />}
                <div><div className="font-medium text-sm">{i.name}</div><div className="text-xs text-muted-foreground">{i.configured ? "Configured" : "Not configured — set environment variables"}</div></div>
              </div>
              <Badge variant={i.configured ? "default" : "outline"}>{i.configured ? "Connected" : "Not Connected"}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { can } = usePermissions();
  const canEdit = can("SETTINGS", "edit");
  return (
    <>
      <PageHeader title="Settings" subtitle="System configuration, integrations, and audit" />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="routing">Routing</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralTab /></TabsContent>
        <TabsContent value="sla"><SLATab canEdit={canEdit} /></TabsContent>
        <TabsContent value="routing"><RoutingTab canEdit={canEdit} /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
      </Tabs>
    </>
  );
}

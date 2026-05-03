import { useGetResident, getGetResidentQueryKey, useGetResidentLedger, getGetResidentLedgerQueryKey, useGetResidentPayments, getGetResidentPaymentsQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User, Phone, Mail, Building, MapPin, Calendar } from "lucide-react";

export default function ResidentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;

  const { data: residentRes, isLoading: residentLoading } = useGetResident(id, { query: { queryKey: getGetResidentQueryKey(id), enabled: !!id } });
  const { data: ledgerRes, isLoading: ledgerLoading } = useGetResidentLedger(id, { query: { queryKey: getGetResidentLedgerQueryKey(id), enabled: !!id } });
  const { data: paymentsRes, isLoading: paymentsLoading } = useGetResidentPayments(id, { query: { queryKey: getGetResidentPaymentsQueryKey(id), enabled: !!id } });

  const resident = residentRes?.data;
  const ledger = ledgerRes?.data || [];
  const payments = paymentsRes?.data || [];

  if (residentLoading) {
    return <div className="space-y-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!resident) {
    return <div>Resident not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            {resident.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{resident.name}</h1>
            <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {resident.phone}</span>
              <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {resident.email}</span>
            </div>
          </div>
        </div>
        <Badge variant={resident.status === 'ACTIVE' ? "default" : "outline"}>{resident.status}</Badge>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Building className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Property</p>
              <p className="font-bold">{resident.propertyName || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <MapPin className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Room</p>
              <p className="font-bold">{resident.roomNumber || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Calendar className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Check In</p>
              <p className="font-bold">{resident.checkInDate ? new Date(resident.checkInDate).toLocaleDateString() : 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <span className="w-8 h-8 flex items-center justify-center text-primary/50 font-bold text-xl">₹</span>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Monthly Rent</p>
              <p className="font-bold">{resident.monthlyRent ? `₹${resident.monthlyRent}` : 'N/A'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="ledger">
            <TabsList className="mb-4">
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>
            <TabsContent value="ledger">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerLoading ? (
                    <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ) : ledger.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">No ledger entries</TableCell></TableRow>
                  ) : (
                    ledger.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="outline">{entry.type}</Badge></TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="font-medium">₹{entry.amount}</TableCell>
                        <TableCell>
                          <Badge variant={entry.isPaid ? 'default' : 'destructive'}>
                            {entry.isPaid ? 'PAID' : 'UNPAID'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="payments">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    <TableRow><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ) : payments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">No payments</TableCell></TableRow>
                  ) : (
                    payments.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="outline">{payment.mode}</Badge></TableCell>
                        <TableCell>{payment.reference || '-'}</TableCell>
                        <TableCell className="font-medium">₹{payment.amount}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === 'SUCCESS' ? 'default' : payment.status === 'PENDING' ? 'secondary' : 'destructive'}>
                            {payment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

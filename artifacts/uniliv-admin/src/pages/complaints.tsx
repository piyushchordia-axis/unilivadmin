import { useGetComplaints, getGetComplaintsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Complaints() {
  const { data: complaintsRes, isLoading } = useGetComplaints({ query: { queryKey: getGetComplaintsQueryKey() } });
  
  const complaints = complaintsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Complaints</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket No</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : complaints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No complaints found</TableCell>
                </TableRow>
              ) : (
                complaints.map((complaint) => (
                  <TableRow key={complaint.id}>
                    <TableCell className="font-medium">{complaint.ticketNo}</TableCell>
                    <TableCell>{complaint.title}</TableCell>
                    <TableCell>{complaint.category}</TableCell>
                    <TableCell>{complaint.propertyName || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={complaint.priority === 'CRITICAL' || complaint.priority === 'HIGH' ? 'destructive' : 'secondary'}>
                        {complaint.priority}
                      </Badge>
                      {complaint.slaBreach && <Badge variant="destructive" className="ml-2">SLA Breach</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{complaint.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

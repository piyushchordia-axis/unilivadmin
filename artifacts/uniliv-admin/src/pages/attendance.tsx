import { useGetAttendance, getGetAttendanceQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Attendance() {
  const { data: attendanceRes, isLoading } = useGetAttendance({ query: { queryKey: getGetAttendanceQueryKey() } });
  
  const records = attendanceRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In Time</TableHead>
                <TableHead>Out Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No attendance records found</TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{new Date(record.date).toLocaleDateString()}</TableCell>
                    <TableCell>{record.employeeName || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant={record.status === 'PRESENT' ? 'default' : record.status === 'ABSENT' ? 'destructive' : 'secondary'}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.inTime || '-'}</TableCell>
                    <TableCell>{record.outTime || '-'}</TableCell>
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

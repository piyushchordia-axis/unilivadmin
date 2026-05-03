import { useGetLeaves, getGetLeavesQueryKey, useUpdateLeave } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Leaves() {
  const queryClient = useQueryClient();
  const { data: leavesRes, isLoading } = useGetLeaves({ query: { queryKey: getGetLeavesQueryKey() } });
  const updateLeave = useUpdateLeave();
  
  const leaves = leavesRes?.data || [];

  const handleAction = (id: string, status: string) => {
    updateLeave.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLeavesQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Leaves</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : leaves.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests found</TableCell>
                </TableRow>
              ) : (
                leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{leave.employeeName || 'Unknown'}</TableCell>
                    <TableCell><Badge variant="outline">{leave.type}</Badge></TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(leave.fromDate).toLocaleDateString()} - {new Date(leave.toDate).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground">{leave.days} day(s)</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={leave.reason}>{leave.reason}</TableCell>
                    <TableCell>
                      <Badge variant={leave.status === 'APPROVED' ? 'default' : leave.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                        {leave.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {leave.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleAction(leave.id, 'APPROVED')} disabled={updateLeave.isPending}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleAction(leave.id, 'REJECTED')} disabled={updateLeave.isPending}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
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

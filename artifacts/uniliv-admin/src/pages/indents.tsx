import { useGetIndents, getGetIndentsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Indents() {
  const { data: indentsRes, isLoading } = useGetIndents({ query: { queryKey: getGetIndentsQueryKey() } });
  
  const indents = indentsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Indents</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : indents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No indents found</TableCell>
                </TableRow>
              ) : (
                indents.map((indent) => (
                  <TableRow key={indent.id}>
                    <TableCell className="font-medium">{new Date(indent.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{indent.department}</TableCell>
                    <TableCell>{indent.items.length} items</TableCell>
                    <TableCell>
                      <Badge variant={indent.urgency === 'HIGH' ? 'destructive' : 'secondary'}>
                        {indent.urgency}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{indent.status}</Badge>
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

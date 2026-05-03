import { useGetPurchaseOrders, getGetPurchaseOrdersQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrders() {
  const { data: posRes, isLoading } = useGetPurchaseOrders({ query: { queryKey: getGetPurchaseOrdersQueryKey() } });
  
  const pos = posRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : pos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No purchase orders found</TableCell>
                </TableRow>
              ) : (
                pos.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium font-mono">{po.poNumber}</TableCell>
                    <TableCell>{po.vendorName || 'Unknown Vendor'}</TableCell>
                    <TableCell>{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">₹{po.totalAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === 'DELIVERED' ? 'default' : po.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                        {po.status}
                      </Badge>
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

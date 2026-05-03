import { useGetPropertyLeads, getGetPropertyLeadsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function PropertyLeads() {
  const { data: leadsRes, isLoading } = useGetPropertyLeads({ query: { queryKey: getGetPropertyLeadsQueryKey() } });
  
  const leads = leadsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Property Acquisition Pipeline</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Capacity / Rent</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No property leads found</TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.city}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{lead.address}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.ownerName || '-'}</div>
                      <div className="text-xs text-muted-foreground">{lead.ownerPhone || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.bedCount || '-'} Beds</div>
                      <div className="text-xs text-muted-foreground">{lead.askingRent ? `₹${lead.askingRent}` : '-'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lead.stage}</Badge>
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

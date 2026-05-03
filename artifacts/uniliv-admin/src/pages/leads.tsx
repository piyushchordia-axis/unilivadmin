import { useGetLeads, getGetLeadsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Leads() {
  const { data: leadsRes, isLoading } = useGetLeads({ query: { queryKey: getGetLeadsQueryKey() } });
  
  const leads = leadsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Sales Leads</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Source</TableHead>
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
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No leads found</TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.phone}</div>
                      {lead.email && <div className="text-xs text-muted-foreground">{lead.email}</div>}
                    </TableCell>
                    <TableCell>{lead.propertyName || 'Unassigned'}</TableCell>
                    <TableCell><Badge variant="outline">{lead.source}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={
                        lead.stage === 'CONVERTED' ? 'default' : 
                        lead.stage === 'LOST' ? 'destructive' : 
                        'secondary'
                      }>
                        {lead.stage}
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

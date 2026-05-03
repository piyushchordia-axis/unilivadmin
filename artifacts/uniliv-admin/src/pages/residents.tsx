import { useGetResidents, getGetResidentsQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Residents() {
  const { data: residentsRes, isLoading } = useGetResidents({ query: { queryKey: getGetResidentsQueryKey() } });
  
  const residents = residentsRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Residents</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Property / Room</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : residents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No residents found</TableCell>
                </TableRow>
              ) : (
                residents.map((resident) => (
                  <TableRow key={resident.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">
                      <Link href={`/residents/${resident.id}`} className="block">
                        {resident.name}
                      </Link>
                    </TableCell>
                    <TableCell>{resident.propertyName || 'N/A'} / {resident.roomNumber || 'N/A'}</TableCell>
                    <TableCell>{resident.phone}</TableCell>
                    <TableCell>{resident.checkInDate ? new Date(resident.checkInDate).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={resident.status === 'ACTIVE' ? 'default' : 'outline'}>
                        {resident.status}
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

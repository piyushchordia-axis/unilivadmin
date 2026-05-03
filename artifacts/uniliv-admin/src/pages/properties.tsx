import { useGetProperties, getGetPropertiesQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export default function Properties() {
  const { data: propertiesRes, isLoading } = useGetProperties({ query: { queryKey: getGetPropertiesQueryKey() } });
  
  const properties = propertiesRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Beds</TableHead>
                <TableHead>Occupancy</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              ) : properties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No properties found</TableCell>
                </TableRow>
              ) : (
                properties.map((property) => (
                  <TableRow key={property.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">
                      <Link href={`/properties/${property.id}`} className="block">
                        {property.name}
                      </Link>
                    </TableCell>
                    <TableCell>{property.city}, {property.state}</TableCell>
                    <TableCell>{property.occupiedBeds} / {property.totalBeds}</TableCell>
                    <TableCell>
                      <Badge variant={property.occupancyRate > 90 ? "default" : property.occupancyRate > 70 ? "secondary" : "destructive"}>
                        {property.occupancyRate}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={property.status === 'ACTIVE' ? "default" : "outline"}>
                        {property.status}
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

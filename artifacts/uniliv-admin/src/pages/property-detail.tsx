import { useGetProperty, getGetPropertyQueryKey, useGetRooms, getGetRoomsQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Bed, MapPin } from "lucide-react";

export default function PropertyDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;

  const { data: propertyRes, isLoading: propertyLoading } = useGetProperty(id, { query: { queryKey: getGetPropertyQueryKey(id), enabled: !!id } });
  const { data: roomsRes, isLoading: roomsLoading } = useGetRooms({ propertyId: id }, { query: { queryKey: getGetRoomsQueryKey({ propertyId: id }), enabled: !!id } });

  const property = propertyRes?.data;
  const rooms = roomsRes?.data || [];

  if (propertyLoading) {
    return <div className="space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!property) {
    return <div>Property not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{property.name}</h1>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="w-4 h-4" /> {property.address}, {property.city}, {property.state} {property.pincode}
          </p>
        </div>
        <Badge variant={property.status === 'ACTIVE' ? "default" : "outline"}>{property.status}</Badge>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{property.occupancyRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupied Beds</CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{property.occupiedBeds}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Beds</CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{property.totalBeds}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Rooms</h2>
        {roomsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg">No rooms found for this property</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rooms.map(room => (
              <Card key={room.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-lg">{room.number}</span>
                    <Badge variant={room.status === 'VACANT' ? 'default' : room.status === 'OCCUPIED' ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">
                      {room.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Floor {room.floor} {room.wing ? `· Wing ${room.wing}` : ''}
                  </div>
                  <div className="text-sm font-medium mt-1">
                    {room.type} · {room.occupancy}/{room.capacity} Beds
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

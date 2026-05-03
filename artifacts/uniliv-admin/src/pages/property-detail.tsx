import * as React from "react";
import {
  useGetProperty,
  getGetPropertyQueryKey,
  useGetRooms,
  getGetRoomsQueryKey,
  useGetResidents,
  getGetResidentsQueryKey,
  useGetComplaints,
  getGetComplaintsQueryKey,
  useCreateRoom,
  useUpdateRoom,
  type RoomDto,
} from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormModal } from "@/components/ui/form-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  ChevronLeft,
  Bed,
  Users,
  AlertCircle,
  Plus,
  Pencil,
  Phone,
  Mail,
  UserCog,
  FileText,
  Tag,
} from "lucide-react";
import {
  PORTFOLIO_TYPE_LABELS,
  ATTR_LABELS,
  portfolioAttrFields,
  type PortfolioType,
  type PortfolioAttributes,
} from "@/lib/portfolio-types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const roomSchema = z.object({
  number: z.string().min(1),
  floor: z.coerce.number().min(0),
  wing: z.string().optional(),
  type: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORMITORY"]),
  capacity: z.coerce.number().min(1),
  status: z.enum(["VACANT", "OCCUPIED", "MAINTENANCE", "BLOCKED"]),
});
type RoomForm = z.infer<typeof roomSchema>;

function RoomFormModal({
  open,
  onOpenChange,
  propertyId,
  room,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  propertyId: string;
  room?: RoomDto | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!room;
  const createMut = useCreateRoom();
  const updateMut = useUpdateRoom();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      number: "",
      floor: 0,
      wing: "",
      type: "SINGLE",
      capacity: 1,
      status: "VACANT",
    },
  });

  React.useEffect(() => {
    if (open) {
      if (room) {
        reset({
          number: room.number,
          floor: room.floor,
          wing: room.wing || "",
          type: (room.type as any) || "SINGLE",
          capacity: room.capacity,
          status: (room.status as any) || "VACANT",
        });
      } else {
        reset({
          number: "",
          floor: 0,
          wing: "",
          type: "SINGLE",
          capacity: 1,
          status: "VACANT",
        });
      }
    }
  }, [open, room, reset]);

  const onSubmit = async (values: RoomForm) => {
    try {
      const body: any = { ...values, propertyId, wing: values.wing || undefined };
      if (isEdit && room) {
        await updateMut.mutateAsync({ id: room.id, data: body });
        toast({ title: "Room updated" });
      } else {
        await createMut.mutateAsync({ data: body });
        toast({ title: "Room created" });
      }
      qc.invalidateQueries({ queryKey: getGetRoomsQueryKey({ propertyId }) });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e?.message || "Failed", variant: "destructive" });
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Room" : "Add Room"}
      onSave={handleSubmit(onSubmit)}
      isSaving={createMut.isPending || updateMut.isPending}
      saveLabel={isEdit ? "Save Changes" : "Create Room"}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Room Number *</Label>
            <Input data-testid="input-room-number" {...register("number")} />
            {errors.number && <p className="text-xs text-destructive">{errors.number.message}</p>}
          </div>
          <div>
            <Label>Floor *</Label>
            <Input type="number" data-testid="input-room-floor" {...register("floor")} />
            {errors.floor && <p className="text-xs text-destructive">{errors.floor.message}</p>}
          </div>
          <div>
            <Label>Wing</Label>
            <Input data-testid="input-room-wing" {...register("wing")} />
          </div>
          <div>
            <Label>Type *</Label>
            <Select value={watch("type")} onValueChange={(v) => setValue("type", v as any)}>
              <SelectTrigger data-testid="select-room-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">Single</SelectItem>
                <SelectItem value="DOUBLE">Double</SelectItem>
                <SelectItem value="TRIPLE">Triple</SelectItem>
                <SelectItem value="DORMITORY">Dormitory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Capacity *</Label>
            <Input type="number" min={1} data-testid="input-room-capacity" {...register("capacity")} />
            {errors.capacity && <p className="text-xs text-destructive">{errors.capacity.message}</p>}
          </div>
          <div>
            <Label>Status</Label>
            <Select value={watch("status")} onValueChange={(v) => setValue("status", v as any)}>
              <SelectTrigger data-testid="select-room-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VACANT">Vacant</SelectItem>
                <SelectItem value="OCCUPIED">Occupied</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </FormModal>
  );
}

export default function PropertyDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const [, setLocation] = useLocation();

  const { data: propertyRes, isLoading: propertyLoading } = useGetProperty(id, {
    query: { queryKey: getGetPropertyQueryKey(id), enabled: !!id },
  });
  const { data: roomsRes, isLoading: roomsLoading } = useGetRooms(
    { propertyId: id },
    { query: { queryKey: getGetRoomsQueryKey({ propertyId: id }), enabled: !!id } }
  );
  const { data: residentsRes } = useGetResidents(
    { propertyId: id },
    { query: { queryKey: getGetResidentsQueryKey({ propertyId: id }), enabled: !!id } }
  );
  const { data: complaintsRes } = useGetComplaints(
    { propertyId: id },
    { query: { queryKey: getGetComplaintsQueryKey({ propertyId: id }), enabled: !!id } }
  );

  const property = propertyRes?.data;
  const rooms = roomsRes?.data || [];
  const residents = residentsRes?.data || [];
  const complaints = complaintsRes?.data || [];

  const [roomFilterStatus, setRoomFilterStatus] = React.useState("ALL");
  const [roomFilterType, setRoomFilterType] = React.useState("ALL");
  const [roomModalOpen, setRoomModalOpen] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<RoomDto | null>(null);

  const filteredRooms = rooms.filter(
    (r) =>
      (roomFilterStatus === "ALL" || r.status === roomFilterStatus) &&
      (roomFilterType === "ALL" || r.type === roomFilterType)
  );

  if (propertyLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!property) return <div>Property not found</div>;

  const occupied = property.occupiedBeds || 0;
  const vacant = (property.totalBeds || 0) - occupied;

  return (
    <div className="space-y-6">
      <Link href="/properties">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" data-testid="link-back-properties">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Properties
        </Button>
      </Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-primary">
            {property.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-property-portfolio-type">
              <Tag className="w-3 h-3" />
              {PORTFOLIO_TYPE_LABELS[(property.portfolioType as PortfolioType) || "CO_LIVING"]}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-1 mt-1 text-sm">
            <MapPin className="w-4 h-4" /> {property.address}, {property.city},{" "}
            {property.state} {property.pincode}
          </p>
        </div>
        <StatusBadge status={property.status} className="px-3 py-1" />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full"><Bed className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Total Beds</p>
              <p className="text-2xl font-display font-bold text-primary">{property.totalBeds}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-full"><Users className="w-5 h-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Occupied</p>
              <p className="text-2xl font-display font-bold text-primary">{occupied}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-warning/10 rounded-full"><Bed className="w-5 h-5 text-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Vacant</p>
              <p className="text-2xl font-display font-bold text-primary">{vacant}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full"><AlertCircle className="w-5 h-5 text-destructive" /></div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Complaints</p>
              <p className="text-2xl font-display font-bold text-primary">{complaints.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-surface">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="rooms" data-testid="tab-rooms">Rooms</TabsTrigger>
          <TabsTrigger value="residents" data-testid="tab-residents">Residents</TabsTrigger>
          <TabsTrigger value="complaints" data-testid="tab-complaints">Complaints</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-display font-semibold text-primary mb-3">Location</h3>
                {property.lat && property.lng ? (
                  <iframe
                    title="map"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.lng - 0.005}%2C${property.lat - 0.005}%2C${property.lng + 0.005}%2C${property.lat + 0.005}&layer=mapnik&marker=${property.lat}%2C${property.lng}`}
                    className="w-full h-64 rounded-lg border"
                  />
                ) : (
                  <div className="w-full h-64 rounded-lg border border-dashed bg-surface flex items-center justify-center text-sm text-muted-foreground">
                    Location coordinates not set
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="space-y-4">
              {(() => {
                const t = (property.portfolioType as PortfolioType) || "CO_LIVING";
                const fields = portfolioAttrFields(t);
                const attrs = (property.portfolioAttributes as PortfolioAttributes) || {};
                if (fields.length === 0) return null;
                return (
                  <Card data-testid="card-portfolio-attributes">
                    <CardContent className="p-4">
                      <h3 className="font-display font-semibold text-primary mb-3">
                        {PORTFOLIO_TYPE_LABELS[t]} Details
                      </h3>
                      <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">
                        {fields.map((f) => {
                          const v: PortfolioAttributes[typeof f] = attrs[f];
                          let display: React.ReactNode = "—";
                          if (v !== undefined && v !== null && v !== "") {
                            if (typeof v === "boolean") display = v ? "Yes" : "No";
                            else display = String(v);
                          }
                          return (
                            <React.Fragment key={f}>
                              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                                {ATTR_LABELS[f]}
                              </dt>
                              <dd className="text-primary font-medium">{display}</dd>
                            </React.Fragment>
                          );
                        })}
                      </dl>
                    </CardContent>
                  </Card>
                );
              })()}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-primary mb-3">Amenities</h3>
                  {property.amenities && property.amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {property.amenities.map((a) => (
                        <Badge key={a} variant="secondary">{a}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No amenities listed</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-primary mb-3">Contact</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> {property.phone || "—"}</div>
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {property.email || "—"}</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-primary mb-3 flex items-center gap-2"><UserCog className="w-4 h-4" /> Warden</h3>
                  <p className="text-sm text-muted-foreground">{property.wardenId ? `Warden ID: ${property.wardenId}` : "No warden assigned"}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rooms" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex gap-2">
              <Select value={roomFilterStatus} onValueChange={setRoomFilterStatus}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="VACANT">Vacant</SelectItem>
                  <SelectItem value="OCCUPIED">Occupied</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roomFilterType} onValueChange={setRoomFilterType}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="SINGLE">Single</SelectItem>
                  <SelectItem value="DOUBLE">Double</SelectItem>
                  <SelectItem value="TRIPLE">Triple</SelectItem>
                  <SelectItem value="DORMITORY">Dormitory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="bg-accent hover:bg-accent/90 text-white"
              onClick={() => { setEditingRoom(null); setRoomModalOpen(true); }}
              data-testid="button-add-room"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Room
            </Button>
          </div>
          {roomsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : filteredRooms.length === 0 ? (
            <EmptyState icon={Bed} title="No rooms" description="Add your first room to get started" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredRooms.map((room) => (
                <Card key={room.id} className="hover:border-accent/50 transition-colors group" data-testid={`row-room-${room.id}`}>
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <span className="font-display font-bold text-2xl text-primary">{room.number}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => { setEditingRoom(room); setRoomModalOpen(true); }} data-testid={`button-edit-room-${room.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Floor {room.floor}{room.wing ? ` · Wing ${room.wing}` : ""}
                    </div>
                    <div className="text-sm flex justify-between items-center border-t pt-2">
                      <Badge variant="outline" className="text-xs">{room.type}</Badge>
                      <span className="text-primary font-medium">{room.occupancy}/{room.capacity}</span>
                    </div>
                    <StatusBadge status={room.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <RoomFormModal
            open={roomModalOpen}
            onOpenChange={setRoomModalOpen}
            propertyId={id}
            room={editingRoom}
          />
        </TabsContent>

        <TabsContent value="residents" className="mt-6">
          <DataTable
            columns={[
              { accessorKey: "name", header: "Name" },
              { accessorKey: "roomNumber", header: "Room", cell: ({ row }: any) => row.original.roomNumber || "—" },
              { accessorKey: "phone", header: "Phone" },
              { accessorKey: "planType", header: "Plan", cell: ({ row }: any) => row.original.planType || "—" },
              { accessorKey: "status", header: "Status", cell: ({ row }: any) => <StatusBadge status={row.original.status} /> },
            ] as any}
            data={residents}
            onRowClick={(r: any) => setLocation(`/residents/${r.id}`)}
          />
        </TabsContent>

        <TabsContent value="complaints" className="mt-6">
          <DataTable
            columns={[
              { accessorKey: "ticketNo", header: "Ticket", cell: ({ row }: any) => <span className="font-mono text-xs">{row.original.ticketNo}</span> },
              { accessorKey: "title", header: "Title" },
              { accessorKey: "category", header: "Category" },
              { accessorKey: "priority", header: "Priority", cell: ({ row }: any) => <StatusBadge status={row.original.priority} /> },
              { accessorKey: "status", header: "Status", cell: ({ row }: any) => <StatusBadge status={row.original.status} /> },
              { accessorKey: "createdAt", header: "Date", cell: ({ row }: any) => new Date(row.original.createdAt).toLocaleDateString() },
            ] as any}
            data={complaints}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["Property License", "Lease Agreement", "Tax Records", "Insurance"].map((label) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-primary">{label}</p>
                      <p className="text-xs text-muted-foreground">Not uploaded</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled>Upload</Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6">
            <EmptyState
              icon={FileText}
              title="Document storage pending"
              description="Documents will be stored once object storage is configured"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

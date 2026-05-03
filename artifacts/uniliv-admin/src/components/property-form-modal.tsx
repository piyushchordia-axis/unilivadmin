import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateProperty,
  useUpdateProperty,
  getGetPropertiesQueryKey,
  getGetPropertyQueryKey,
  type PropertyDto,
} from "@workspace/api-client-react";
import { FormModal } from "@/components/ui/form-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const AMENITIES = [
  "Wifi",
  "AC",
  "Laundry",
  "Mess",
  "Security",
  "Gym",
  "Library",
  "Parking",
  "CCTV",
  "Power Backup",
];

const schema = z.object({
  name: z.string().min(1, "Name required"),
  address: z.string().min(1, "Address required"),
  city: z.string().min(1, "City required"),
  state: z.string().min(1, "State required"),
  pincode: z.string().regex(/^\d{6}$/, "6-digit pincode"),
  totalBeds: z.coerce.number().min(1, "Min 1"),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{10}$/.test(v), { message: "10-digit phone" }),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE", "UNDER_RENOVATION"]),
});

type FormValues = z.infer<typeof schema>;

interface PropertyFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: PropertyDto | null;
}

export function PropertyFormModal({
  open,
  onOpenChange,
  property,
}: PropertyFormModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!property;
  const [amenities, setAmenities] = React.useState<string[]>([]);
  const [coords, setCoords] = React.useState<{ lat?: number; lng?: number }>({});
  const [geocoding, setGeocoding] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      totalBeds: 1,
      phone: "",
      email: "",
      status: "ACTIVE",
    },
  });

  React.useEffect(() => {
    if (open) {
      if (property) {
        reset({
          name: property.name,
          address: property.address,
          city: property.city,
          state: property.state,
          pincode: property.pincode,
          totalBeds: property.totalBeds,
          phone: property.phone || "",
          email: property.email || "",
          status: (property.status as any) || "ACTIVE",
        });
        setAmenities(property.amenities || []);
        setCoords({
          lat: property.lat ?? undefined,
          lng: property.lng ?? undefined,
        });
      } else {
        reset({
          name: "",
          address: "",
          city: "",
          state: "",
          pincode: "",
          totalBeds: 1,
          phone: "",
          email: "",
          status: "ACTIVE",
        });
        setAmenities([]);
        setCoords({});
      }
    }
  }, [open, property, reset]);

  const createMut = useCreateProperty();
  const updateMut = useUpdateProperty();

  const toggleAmenity = (a: string) =>
    setAmenities((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );

  const handleGeocode = async () => {
    const address = watch("address");
    const city = watch("city");
    const state = watch("state");
    const q = [address, city, state].filter(Boolean).join(", ");
    if (!q) {
      toast({ title: "Enter address first", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "UnilivAdmin/1.0" } as any }
      );
      const json = await res.json();
      if (json && json[0]) {
        setCoords({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) });
        toast({ title: "Location found" });
      } else {
        toast({ title: "Location not found", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Geocoding failed", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    const body: any = {
      ...values,
      amenities,
      lat: coords.lat,
      lng: coords.lng,
      phone: values.phone || undefined,
      email: values.email || undefined,
    };
    try {
      if (isEdit && property) {
        await updateMut.mutateAsync({ id: property.id, data: body });
        toast({ title: "Property updated" });
      } else {
        await createMut.mutateAsync({ data: body });
        toast({ title: "Property created" });
      }
      queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() });
      if (property) {
        queryClient.invalidateQueries({
          queryKey: getGetPropertyQueryKey(property.id),
        });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e?.message || "Failed to save", variant: "destructive" });
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;
  const status = watch("status");

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Property" : "Add Property"}
      onSave={handleSubmit(onSubmit)}
      isSaving={isSaving}
      saveLabel={isEdit ? "Save Changes" : "Create Property"}
    >
      <div className="space-y-4">
        <div>
          <Label>Name *</Label>
          <Input data-testid="input-property-name" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>
        <div>
          <Label>Address *</Label>
          <Textarea data-testid="input-property-address" rows={2} {...register("address")} />
          {errors.address && (
            <p className="text-xs text-destructive mt-1">{errors.address.message}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>City *</Label>
            <Input data-testid="input-property-city" {...register("city")} />
            {errors.city && (
              <p className="text-xs text-destructive mt-1">{errors.city.message}</p>
            )}
          </div>
          <div>
            <Label>State *</Label>
            <Input data-testid="input-property-state" {...register("state")} />
            {errors.state && (
              <p className="text-xs text-destructive mt-1">{errors.state.message}</p>
            )}
          </div>
          <div>
            <Label>Pincode *</Label>
            <Input data-testid="input-property-pincode" {...register("pincode")} />
            {errors.pincode && (
              <p className="text-xs text-destructive mt-1">{errors.pincode.message}</p>
            )}
          </div>
          <div>
            <Label>Total Beds *</Label>
            <Input
              data-testid="input-property-beds"
              type="number"
              min={1}
              {...register("totalBeds")}
            />
            {errors.totalBeds && (
              <p className="text-xs text-destructive mt-1">{errors.totalBeds.message}</p>
            )}
          </div>
          <div>
            <Label>Phone</Label>
            <Input data-testid="input-property-phone" {...register("phone")} />
            {errors.phone && (
              <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <Label>Email</Label>
            <Input data-testid="input-property-email" {...register("email")} />
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setValue("status", v as any)}
          >
            <SelectTrigger data-testid="select-property-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="UNDER_RENOVATION">Under Renovation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Amenities</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {AMENITIES.map((a) => {
              const active = amenities.includes(a);
              return (
                <Badge
                  key={a}
                  data-testid={`chip-amenity-${a}`}
                  variant={active ? "default" : "outline"}
                  className={`cursor-pointer select-none ${
                    active ? "bg-accent text-white hover:bg-accent/90" : ""
                  }`}
                  onClick={() => toggleAmenity(a)}
                >
                  {a}
                </Badge>
              );
            })}
          </div>
        </div>
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Location
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGeocode}
              disabled={geocoding}
              data-testid="button-geocode-address"
            >
              {geocoding && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Geocode address
            </Button>
          </div>
          {coords.lat && coords.lng ? (
            <>
              <p className="text-xs text-muted-foreground mb-2 font-mono">
                Lat: {coords.lat.toFixed(6)}, Lng: {coords.lng.toFixed(6)}
              </p>
              <iframe
                title="map"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.005}%2C${coords.lat - 0.005}%2C${coords.lng + 0.005}%2C${coords.lat + 0.005}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`}
                className="w-full h-48 rounded-lg border"
              />
            </>
          ) : (
            <div className="w-full h-32 rounded-lg border border-dashed bg-surface flex items-center justify-center text-xs text-muted-foreground">
              Click Geocode to fetch coordinates
            </div>
          )}
        </div>
      </div>
    </FormModal>
  );
}

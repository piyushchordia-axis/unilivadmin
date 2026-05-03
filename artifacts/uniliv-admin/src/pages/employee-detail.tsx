import { useGetEmployee, getGetEmployeeQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Phone, Mail, Calendar, Building } from "lucide-react";

export default function EmployeeDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;

  const { data: employeeRes, isLoading } = useGetEmployee(id, { query: { queryKey: getGetEmployeeQueryKey(id), enabled: !!id } });

  const employee = employeeRes?.data;

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!employee) {
    return <div>Employee not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            {employee.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{employee.name}</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-mono">{employee.employeeCode}</Badge>
              {employee.designation} · {employee.department}
            </p>
          </div>
        </div>
        <Badge variant={employee.status === 'ACTIVE' ? "default" : "outline"}>{employee.status}</Badge>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Phone className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p className="font-medium">{employee.phone}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Mail className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="font-medium truncate max-w-[150px]" title={employee.email}>{employee.email}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Calendar className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Joining Date</p>
              <p className="font-medium">{new Date(employee.joiningDate).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <Building className="w-8 h-8 text-primary/50" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Property</p>
              <p className="font-medium">{employee.propertyId ? 'Assigned' : 'HQ'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Attendance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Attendance records will be displayed here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

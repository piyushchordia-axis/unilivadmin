import { useGetCourses, getGetCoursesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Users } from "lucide-react";

export default function Courses() {
  const { data: coursesRes, isLoading } = useGetCourses({ query: { queryKey: getGetCoursesQueryKey() } });
  
  const courses = coursesRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">L&D Courses</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)
        ) : courses.length === 0 ? (
          <div className="col-span-3 text-center py-8 text-muted-foreground border rounded-lg">No courses found</div>
        ) : (
          courses.map((course) => (
            <Card key={course.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start gap-4">
                  <CardTitle className="text-lg leading-tight">{course.title}</CardTitle>
                  {course.isMandatory && <Badge variant="destructive">Mandatory</Badge>}
                </div>
                <Badge variant="outline" className="w-fit mt-2">{course.category}</Badge>
              </CardHeader>
              <CardContent className="mt-auto pt-4 flex justify-between items-center text-sm text-muted-foreground border-t">
                <div className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {course.contentType}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {course.enrollmentCount} Enrolled
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

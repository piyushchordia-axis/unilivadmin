import { useGetRecipes, getGetRecipesQueryKey, useGetMenuPlans, getGetMenuPlansQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Kitchen() {
  const { data: recipesRes, isLoading: recipesLoading } = useGetRecipes({ query: { queryKey: getGetRecipesQueryKey() } });
  const { data: plansRes, isLoading: plansLoading } = useGetMenuPlans({ query: { queryKey: getGetMenuPlansQueryKey() } });
  
  const recipes = recipesRes?.data || [];
  const plans = plansRes?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Kitchen Operations</h1>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="menu-plans">Menu Plans</TabsTrigger>
        </TabsList>
        
        <TabsContent value="recipes" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipe Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Meal Type</TableHead>
                    <TableHead>Dietary</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipesLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell>
                    </TableRow>
                  ) : recipes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No recipes found</TableCell>
                    </TableRow>
                  ) : (
                    recipes.map((recipe) => (
                      <TableRow key={recipe.id}>
                        <TableCell className="font-medium">{recipe.name}</TableCell>
                        <TableCell>{recipe.category}</TableCell>
                        <TableCell>{recipe.mealType}</TableCell>
                        <TableCell>
                          <Badge variant={recipe.isVeg ? "secondary" : "destructive"}>
                            {recipe.isVeg ? 'VEG' : 'NON-VEG'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={recipe.isActive ? "default" : "outline"}>
                            {recipe.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="menu-plans" className="mt-6">
          <div className="grid gap-6">
            {plansLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : plans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">No menu plans found</div>
            ) : (
              plans.map(plan => (
                <Card key={plan.id}>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg">Week of {new Date(plan.weekStart).toLocaleDateString()}</CardTitle>
                      <Badge variant={plan.status === 'PUBLISHED' ? 'default' : 'secondary'}>{plan.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      {Object.keys(plan.slots).length} meals planned
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useGetJobRequisitions, getGetJobRequisitionsQueryKey, useGetCandidates, getGetCandidatesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Recruitment() {
  const { data: reqsRes, isLoading: reqsLoading } = useGetJobRequisitions({ query: { queryKey: getGetJobRequisitionsQueryKey() } });
  const { data: candidatesRes, isLoading: candidatesLoading } = useGetCandidates({ query: { queryKey: getGetCandidatesQueryKey() } });
  
  const requisitions = reqsRes?.data || [];
  const candidates = candidatesRes?.data || [];

  const stages = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'JOINED', 'REJECTED'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Recruitment</h1>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Candidates Pipeline</TabsTrigger>
          <TabsTrigger value="requisitions">Job Requisitions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pipeline" className="mt-6">
          {candidatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {stages.map(s => <Skeleton key={s} className="h-64 w-full" />)}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {stages.map(stage => {
                const stageCandidates = candidates.filter(c => c.stage === stage);
                return (
                  <div key={stage} className="min-w-[280px] bg-muted/50 rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-semibold text-sm">{stage}</h3>
                      <Badge variant="secondary">{stageCandidates.length}</Badge>
                    </div>
                    {stageCandidates.map(candidate => (
                      <Card key={candidate.id} className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm">
                        <CardContent className="p-3">
                          <p className="font-medium text-sm">{candidate.name}</p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">{candidate.email}</p>
                          {candidate.source && (
                            <Badge variant="outline" className="mt-2 text-[10px] px-1.5 py-0">{candidate.source}</Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {stageCandidates.length === 0 && (
                      <div className="text-center py-4 text-xs text-muted-foreground">No candidates</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requisitions" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reqsLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)
            ) : requisitions.length === 0 ? (
              <div className="col-span-3 text-center py-8 text-muted-foreground border rounded-lg">No job requisitions found</div>
            ) : (
              requisitions.map(req => (
                <Card key={req.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{req.role}</CardTitle>
                      <Badge variant={req.status === 'OPEN' ? 'default' : 'secondary'}>{req.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{req.department}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between text-sm mt-4">
                      <span>Target: {req.headcount}</span>
                      <span>Candidates: {req.candidateCount}</span>
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

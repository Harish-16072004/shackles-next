'use client'

import { useLeaderboardSSE } from "@/hooks/useLeaderboardSSE";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface RealTimeLeaderboardProps {
  eventId: string;
  eventName: string;
}

export function RealTimeLeaderboard({ eventId, eventName }: RealTimeLeaderboardProps) {
  const { data, status } = useLeaderboardSSE(eventId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{eventName} Leaderboard</h2>
          <p className="text-muted-foreground">Live updates enabled via SSE</p>
        </div>
        <Badge variant={status === "connected" ? "default" : "outline"} className="capitalize">
          {status}
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>Team Name</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data.teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No scores submitted yet.
                </TableCell>
              </TableRow>
            ) : (
              data.teams.map((team) => (
                <TableRow key={team.teamId} className="animate-in fade-in duration-500">
                  <TableCell className="font-medium">#{team.rank}</TableCell>
                  <TableCell>{team.teamName}</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {team.totalMarks.toFixed(2)} / {data.maxMarks}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

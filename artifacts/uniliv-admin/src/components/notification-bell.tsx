import * as React from "react";
import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/lib/store";

interface Notif { id: string; title: string; body?: string | null; type: string; link?: string | null; isRead: boolean; createdAt: string }

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isAuth = useAuthStore((s) => !!s.token);
  const { data } = useQuery<{ data: Notif[]; meta?: { unreadCount?: number } }>({
    queryKey: ["/notifications"],
    queryFn: () => apiFetch("/notifications"),
    refetchInterval: 30_000,
    enabled: isAuth,
  });
  const items = data?.data || [];
  const unread = data?.meta?.unreadCount ?? items.filter((i) => !i.isRead).length;

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/notifications"] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center border-2 border-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <button className="text-xs text-accent hover:underline" onClick={() => markAll.mutate()}>Mark all read</button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No new notifications</div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                className={`w-full text-left px-3 py-2.5 border-b hover:bg-surface flex flex-col gap-0.5 ${!n.isRead ? "bg-accent/5" : ""}`}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.link) setLocation(n.link);
                }}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
                  <span className="font-medium text-sm flex-1">{n.title}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</span>
                </div>
                {n.body && <span className="text-xs text-muted-foreground line-clamp-2 ml-3.5">{n.body}</span>}
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

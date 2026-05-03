import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/lib/store";
import { useLogout } from "@workspace/api-client-react";
import { LogOut, Home, Building, Users, AlertCircle, FileText, Calendar, CheckSquare, Briefcase, ShoppingBag, ClipboardList, Box, UtensilsCrossed, TrendingUp, BookOpen, MapPin, Settings } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { setToken } = useAuthStore();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        setToken(null);
        setLocation("/login");
      }
    });
  };

  const navGroups = [
    {
      title: "Core",
      items: [
        { title: "Dashboard", href: "/", icon: Home },
        { title: "Properties", href: "/properties", icon: Building },
        { title: "Rooms", href: "/rooms", icon: Box },
        { title: "Residents", href: "/residents", icon: Users },
        { title: "Complaints", href: "/complaints", icon: AlertCircle },
      ]
    },
    {
      title: "HRMS",
      items: [
        { title: "Employees", href: "/employees", icon: Briefcase },
        { title: "Attendance", href: "/attendance", icon: Calendar },
        { title: "Leaves", href: "/leaves", icon: FileText },
        { title: "Recruitment", href: "/recruitment", icon: Users },
      ]
    },
    {
      title: "Procurement",
      items: [
        { title: "Vendors", href: "/vendors", icon: ShoppingBag },
        { title: "Indents", href: "/indents", icon: ClipboardList },
        { title: "Purchase Orders", href: "/purchase-orders", icon: FileText },
        { title: "Inventory", href: "/inventory", icon: Box },
      ]
    },
    {
      title: "Operations",
      items: [
        { title: "Kitchen", href: "/kitchen", icon: UtensilsCrossed },
        { title: "Leads", href: "/leads", icon: TrendingUp },
        { title: "Courses", href: "/courses", icon: BookOpen },
        { title: "Property Leads", href: "/property-leads", icon: MapPin },
        { title: "Users", href: "/users", icon: Users },
        { title: "Settings", href: "/settings", icon: Settings },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-muted/40">
      <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0 border-r border-sidebar-border">
        <div className="p-6 font-bold text-xl tracking-tight flex items-center gap-2">
          <span className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">U</span>
          UNILIV ADMIN
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="px-4 space-y-6">
            {navGroups.map((group) => (
              <div key={group.title}>
                <h4 className="text-xs uppercase text-sidebar-foreground/50 font-semibold mb-2 tracking-wider px-2">{group.title}</h4>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <span className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors cursor-pointer text-sm font-medium">
                        <item.icon className="w-4 h-4" />
                        {item.title}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border mt-auto">
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-md bg-sidebar-accent/50 hover:bg-destructive hover:text-destructive-foreground transition-colors text-sm font-medium"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
}

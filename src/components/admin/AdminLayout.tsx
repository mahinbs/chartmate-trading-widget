import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, BarChart3 } from "lucide-react";

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isUsers = location.pathname === "/admin/users" || location.pathname === "/admin";
  const isPredictions = location.pathname === "/admin/predictions";

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/home")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
            <h1 className="text-xl md:text-2xl font-bold">Admin Panel</h1>
          </div>
          <Tabs value={isPredictions ? "daily" : "users"} onValueChange={(v) => navigate(v === "daily" ? "/admin/predictions" : "/admin/users")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                List of Users
              </TabsTrigger>
              <TabsTrigger value="daily" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Daily Shares
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}

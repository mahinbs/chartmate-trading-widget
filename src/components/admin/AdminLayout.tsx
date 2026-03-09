import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, BarChart3, FileText } from "lucide-react";

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const currentTab = path.includes("/admin/predictions")
    ? "daily"
    : path.includes("/admin/blogs")
    ? "blogs"
    : path.includes("/admin/public-dashboard")
    ? "stats"
    : "users";

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
          <Tabs
            value={currentTab}
            onValueChange={(v) => {
              if (v === "daily") navigate("/admin/predictions");
              else if (v === "blogs") navigate("/admin/blogs");
              else if (v === "stats") navigate("/admin/public-dashboard");
              else navigate("/admin/users");
            }}
          >
            <TabsList className="grid w-full max-w-xl grid-cols-4">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                List of Users
              </TabsTrigger>
              <TabsTrigger value="daily" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Daily Shares
              </TabsTrigger>
              <TabsTrigger value="blogs" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Blogs
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Public Dashboard
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

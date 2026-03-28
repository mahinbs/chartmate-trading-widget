import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useSignupProfile } from "@/hooks/useSignupProfile";
import { supabase } from "@/integrations/supabase/client";

export default function ProfilePage() {
  const { user } = useAuth();
  const { profile, loading, refresh } = useSignupProfile();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    const meta = user.user_metadata as Record<string, string> | undefined;
    setFullName(
      profile?.full_name?.trim() ||
        (meta?.full_name?.trim() ?? ""),
    );
    setPhone(profile?.phone ?? meta?.phone ?? "");
    setCountry(profile?.country ?? meta?.country ?? "");
  }, [user, profile]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const name = fullName.trim();
    if (name.length < 2) {
      toast.error("Please enter your full name (at least 2 characters).");
      return;
    }
    const nextEmail = email.trim().toLowerCase();
    const currentEmail = (user.email ?? "").toLowerCase();
    setSavingProfile(true);
    try {
      if (nextEmail && nextEmail !== currentEmail) {
        const { error: emailErr } = await supabase.auth.updateUser({
          email: nextEmail,
        });
        if (emailErr) throw emailErr;
        toast.success(
          "If required, check your inbox to confirm the new email address.",
        );
      }

      const { error: upErr } = await supabase.auth.updateUser({
        data: {
          full_name: name,
          phone: phone.trim(),
          country: country.trim(),
        },
      });
      if (upErr) throw upErr;

      const { error: rowErr } = await (supabase as any)
        .from("user_signup_profiles")
        .upsert(
          {
            user_id: user.id,
            email: user.email ?? null,
            full_name: name,
            phone: phone.trim() || null,
            country: country.trim() || null,
          },
          { onConflict: "user_id" },
        );
      if (rowErr) throw rowErr;

      toast.success("Profile saved.");
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not save profile.";
      toast.error(msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signErr) {
        toast.error("Current password is incorrect.");
        return;
      }
      const { error: pwErr } = await supabase.auth.updateUser({
        password: newPassword,
        data: { need_password_reset: false },
      });
      if (pwErr) throw pwErr;
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not update password.";
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <DashboardShellLayout>
      <div className="mx-auto max-w-2xl space-y-8 pb-10">
        <header className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <UserRound className="h-3.5 w-3.5" />
            Account
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Your name, contact details, and password. Name matches what you entered at signup (one
            full name field — not split).
          </p>
        </header>

        <Card className="border-border/80 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Personal details</CardTitle>
            <CardDescription>
              Email sign-in address, phone, and country/region. Saving updates your account and
              signup profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-full-name">Full name</Label>
                  <Input
                    id="profile-full-name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Changing email may send a confirmation link, depending on your project&apos;s
                    auth settings.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Phone</Label>
                    <Input
                      id="profile-phone"
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-country">Country / region</Label>
                    <Input
                      id="profile-country"
                      type="text"
                      autoComplete="country-name"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {profile?.date_of_birth && (
                  <p className="text-xs text-muted-foreground">
                    Date of birth on file:{" "}
                    <span className="text-foreground font-medium">{profile.date_of_birth}</span>
                    {" — "}
                    contact support if it needs correcting.
                  </p>
                )}
                <Button type="submit" disabled={savingProfile} className="gap-2">
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save profile
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Password</CardTitle>
            <CardDescription>
              Enter your current password, then your new password twice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm new password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={savingPassword} className="gap-2">
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShellLayout>
  );
}

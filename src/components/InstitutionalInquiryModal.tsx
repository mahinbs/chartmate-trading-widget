import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type InstitutionalInquiryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InstitutionalInquiryModal({ open, onOpenChange }: InstitutionalInquiryModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !phone.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    try {
      const { affiliateId } = getSessionAffiliateAttribution();
      const planLine = "Institutional - Custom";
      const bodyText =
        `Name: ${name.trim()}\nEmail: ${email.trim()}\nPhone: ${phone.trim()}\nPlan: ${planLine}\nMessage:\n${message.trim()}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("contact_submissions")
        .insert([
          {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            description: `Plan: ${planLine}\n${message.trim()}`,
            ...(affiliateId && { affiliate_id: affiliateId }),
          },
        ])
        .catch(() => {});

      const response = await fetch(
        "https://send-mail-redirect-boostmysites.vercel.app/send-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: bodyText,
            name: "Tradingsmart.AI",
            subject: `Institutional Inquiry from ${name.trim()}`,
            to: "partnerships@chartmate.ai",
          }),
        },
      );

      if (response.ok) {
        toast.success("Message sent. Our team will be in touch.");
        setName("");
        setEmail("");
        setPhone("");
        setMessage("");
        setDone(true);
      } else {
        toast.error("Could not send. Please try again.");
      }
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName("");
          setEmail("");
          setPhone("");
          setMessage("");
          setDone(false);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="font-bebas text-2xl text-white">
            Talk to sales — Institutional
          </DialogTitle>
        </DialogHeader>
        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-teal-500" />
            <p className="mt-4 text-sm text-zinc-400">Thanks — we will reach out shortly.</p>
            <Button
              type="button"
              className="mt-6 w-full"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="inquiry-name">Name</Label>
              <Input
                id="inquiry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-black border-zinc-800"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inquiry-email">Email</Label>
              <Input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-black border-zinc-800"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inquiry-phone">Phone</Label>
              <Input
                id="inquiry-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-black border-zinc-800"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inquiry-message">Message</Label>
              <Textarea
                id="inquiry-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[100px] bg-black border-zinc-800"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-teal-500 text-black font-semibold hover:bg-teal-400"
            >
              {submitting ? "Sending…" : "Submit"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

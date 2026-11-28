# DocuDash — Supabase Auth Email Templates

Configure these templates in **Supabase Dashboard → Authentication → Email Templates**, and verify **Authentication → URL Configuration** has:
- **Site URL:** `https://www.docudash-ph.online`
- **Redirect URLs:** `https://www.docudash-ph.online/**`, `https://docu-dash-omega.vercel.app/**`, `http://localhost:8081/**`

---

## 1. Reset Password (`Reset Password`)

Uses `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` so password reset links work across devices (including mobile APK requests opened in a browser) without PKCE verifier errors.

```html
<div style="background-color:#F8FAFC;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
    <div style="background-color:#01227F;padding:24px 28px;border-bottom:4px solid #FBC128;">
      <div style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">DocuDash</div>
      <div style="font-size:12px;color:#DCE5FF;margin-top:4px;">Barangay Document Pre-Processing &amp; Scheduled Pickup</div>
    </div>

    <div style="padding:28px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#01227F;">Account Recovery</div>
      <h1 style="font-size:22px;font-weight:700;color:#0F172A;margin:8px 0 16px;line-height:1.3;">Reset your password</h1>

      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 16px;">
        Hello{{ if .Data.full_name }} {{ .Data.full_name }}{{ end }},
      </p>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">
        We received a request to reset the password for your DocuDash account (<strong>{{ .Email }}</strong>). Click the button below to choose a new password.
      </p>

      <div style="margin:0 0 24px;">
        <a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;background-color:#01227F;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;">
          Reset Password
        </a>
      </div>

      <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Account</div>
        <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:12px;">{{ .Email }}</div>
        <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Or copy this link into your browser</div>
        <div style="font-size:12px;color:#01227F;word-break:break-all;">{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery</div>
      </div>

      <p style="font-size:13px;line-height:1.5;color:#64748B;margin:24px 0 0;">
        If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.
      </p>
    </div>
  </div>
</div>
```

---

## 2. Password Changed Notification (`Password Changed`)

```html
<div style="background-color:#F8FAFC;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
    <div style="background-color:#01227F;padding:24px 28px;border-bottom:4px solid #FBC128;">
      <div style="font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;">DocuDash</div>
      <div style="font-size:12px;color:#DCE5FF;margin-top:4px;">Barangay Document Pre-Processing &amp; Scheduled Pickup</div>
    </div>

    <div style="padding:28px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#01227F;">Security Alert</div>
      <h1 style="font-size:22px;font-weight:700;color:#0F172A;margin:8px 0 16px;line-height:1.3;">Your password was changed</h1>

      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 16px;">
        Hello{{ if .Data.full_name }} {{ .Data.full_name }}{{ end }},
      </p>
      <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 24px;">
        This is a confirmation that the password for your DocuDash account (<strong>{{ .Email }}</strong>) was recently changed.
      </p>

      <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;">
        <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Account</div>
        <div style="font-size:14px;font-weight:600;color:#0F172A;margin-bottom:12px;">{{ .Email }}</div>
        <div style="font-size:12px;color:#64748B;margin-bottom:4px;">Portal</div>
        <div style="font-size:13px;color:#01227F;word-break:break-all;">{{ .SiteURL }}</div>
      </div>

      <p style="font-size:13px;line-height:1.5;color:#B91C1C;margin:24px 0 0;">
        If you did not make this change, please reset your password immediately or contact your Barangay Office Data Protection Officer.
      </p>
    </div>
  </div>
</div>
```

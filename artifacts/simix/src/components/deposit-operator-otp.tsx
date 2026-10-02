interface DepositOperatorOtpProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function DepositOperatorOtp({ value, onChange, disabled }: DepositOperatorOtpProps) {
  return (
    <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3.5" data-testid="deposit-otp-field">
      <label htmlFor="deposit-operator-otp" className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-foreground">
        Code OTP opérateur
        <span className="text-[10px] font-semibold text-primary">Obligatoire</span>
      </label>
      <p id="deposit-otp-help" className="text-xs text-muted-foreground">
        Saisissez le code temporaire reçu ou généré auprès de votre opérateur pour autoriser ce dépôt.
      </p>
      <input
        id="deposit-operator-otp"
        name="operatorOtp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        aria-required="true"
        aria-describedby="deposit-otp-help deposit-otp-security"
        value={value}
        onChange={event => onChange(event.target.value.replace(/\s/g, ""))}
        disabled={disabled}
        placeholder="Saisissez votre code OTP"
        data-testid="input-operator-otp"
        className="w-full rounded-xl border border-card-border bg-card px-4 py-3 text-sm font-bold text-foreground focus:outline-none focus:border-primary/50 placeholder:font-normal placeholder:text-muted-foreground disabled:opacity-60"
      />
      <p id="deposit-otp-security" className="text-[11px] text-muted-foreground">
        N’entrez jamais votre code PIN secret. Ce code OTP n’est pas conservé.
      </p>
    </div>
  );
}
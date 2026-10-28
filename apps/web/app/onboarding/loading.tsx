export default function OnboardingLoading() {
  return (
    <main className="od-shell" style={{ padding: "4rem 0" }}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CasePicker } from "@/components/case-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCase, useCadastre } from "@/lib/store";
import { constructionKind, unitsForCase } from "@/lib/units";
import {
  encodeUlpin,
  floorElevation,
  floorLabel,
  floorListForCase,
  formatUlpinGroups,
  formatVUlpin,
  parseVUlpin,
} from "@/lib/ulpin";
import { copyText } from "@/lib/utils";

export const Route = createFileRoute("/ulpin")({
  component: UlpinPage,
});

function UlpinPage() {
  const caze = useCadastre(selectCase);
  const [lat, setLat] = useState(String(caze.lat));
  const [lng, setLng] = useState(String(caze.lng));
  const [floor, setFloor] = useState(Math.min(6, caze.floors));
  const [unit, setUnit] = useState("0601");
  const [raw, setRaw] = useState("");

  useEffect(() => {
    setLat(String(caze.lat));
    setLng(String(caze.lng));
    setFloor(Math.min(6, caze.floors));
    setUnit(constructionKind(caze) === "RES" ? "0601" : `${constructionKind(caze)}01`);
    setRaw("");
  }, [caze.ulpin, caze.lat, caze.lng, caze.floors]);

  const floors = floorListForCase(caze);
  const units = useMemo(() => unitsForCase(caze), [caze]);
  const kind = constructionKind(caze);

  const ulpin = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return caze.ulpin;
    if (Math.abs(la - caze.lat) < 1e-6 && Math.abs(ln - caze.lng) < 1e-6) return caze.ulpin;
    return encodeUlpin(la, ln);
  }, [lat, lng, caze.ulpin, caze.lat, caze.lng]);

  const vUlpin = formatVUlpin(ulpin, floor, unit, floorElevation(floor, caze.floors), caze.floors);
  const parsed = parseVUlpin(raw || vUlpin);

  const copy = async (value: string) => {
    const ok = await copyText(value);
    if (ok) toast.message("Copied");
  };

  return (
    <AppShell
      title="Vertical ULPIN"
      subtitle="Unique Land Parcel Identification Number · 3D extension"
      actions={<CasePicker tone="dark" />}
    >
      <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Encode a v-ULPIN</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              14-digit 2D ULPIN from latitude / longitude, then floor band, unit and orthometric
              elevation. This is the identifier the registrar seals onto the ledger.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="floor">Floor</Label>
                <select
                  id="floor"
                  value={floor}
                  onChange={(e) => setFloor(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {floors.map((f) => (
                    <option key={f} value={f}>
                      {floorLabel(f, caze.floors)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-navy px-3 py-3 text-white">
              <div className="text-[10px] uppercase tracking-wider text-white/60">3D ULPIN</div>
              <div className="font-mono text-lg font-semibold tracking-wide">
                {formatUlpinGroups(ulpin)}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-white/60">v-ULPIN</div>
              <div className="flex items-center justify-between gap-2">
                <code className="break-all text-sm">{vUlpin}</code>
                <button type="button" onClick={() => void copy(vUlpin)} aria-label="Copy v-ULPIN">
                  <Copy className="size-4" />
                </button>
              </div>
              <div className="mt-2 text-[11px] text-white/55">
                {caze.project} · {kind} · linked case {caze.id}
              </div>
            </div>
            {caze.lidarMeasuredHeightM != null ? (
              <p className="text-xs text-muted-foreground">
                LiDAR-measured height for this ULPIN:{" "}
                <span className="font-semibold tabular-nums text-ink">
                  {caze.lidarMeasuredHeightM.toFixed(1)} m
                </span>{" "}
                vs declared {caze.heightM.toFixed(1)} m
                {caze.ctsNo ? ` · CTS ${caze.ctsNo}` : ""}.
              </p>
            ) : null}
            <ol className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Part k="ULPIN" v={ulpin} />
              <Part k="Band" v={parsed?.band ?? "—"} />
              <Part k="Unit" v={parsed?.unit ?? "—"} />
              <Part k="Z" v={parsed ? `${parsed.elevation.toFixed(1)} m` : "—"} />
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decode</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="raw">Paste a v-ULPIN</Label>
            <Input
              id="raw"
              value={raw}
              placeholder={vUlpin}
              onChange={(e) => setRaw(e.target.value)}
            />
            {parsed ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">2D ULPIN</dt>
                  <dd className="font-mono text-xs">{parsed.ulpin}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Band</dt>
                  <dd className="font-mono">{parsed.band}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Unit</dt>
                  <dd className="font-mono">{parsed.unit}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Elevation</dt>
                  <dd>{parsed.elevation.toFixed(1)} m MSL offset</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-danger">Could not parse. Expect ULPIN-BAND-UNIT-Z±elev.</p>
            )}
            <Button variant="outline" onClick={() => setRaw(vUlpin)}>
              Fill from encoder
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Unit register — {caze.project}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {formatUlpinGroups(caze.ulpin)} · {kind} · {caze.floors}F + {caze.basements}B
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Unit</th>
                  <th className="px-5 py-2 font-medium">Kind</th>
                  <th className="px-5 py-2 font-medium">Floor</th>
                  <th className="px-5 py-2 font-medium">Carpet</th>
                  <th className="px-5 py-2 font-medium">Owner</th>
                  <th className="px-5 py-2 font-medium">v-ULPIN</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr
                    key={u.vUlpin}
                    className="cursor-pointer border-t border-border hover:bg-secondary/60"
                    onClick={() => {
                      setFloor(u.floor);
                      setUnit(u.unit);
                    }}
                  >
                    <td className="px-5 py-2.5 font-medium">{u.unit}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px]">{u.kind ?? kind}</td>
                    <td className="px-5 py-2.5">{floorLabel(u.floor, caze.floors)}</td>
                    <td className="px-5 py-2.5 tabular-nums">{u.carpetM2.toFixed(1)} m²</td>
                    <td className="px-5 py-2.5">{u.owner}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-accent">{u.vUlpin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Part({ k, v }: { k: string; v: string }) {
  return (
    <li className="rounded-md bg-secondary px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="truncate font-mono text-xs">{v}</div>
    </li>
  );
}

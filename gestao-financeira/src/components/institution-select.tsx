"use client";

import { INSTITUTION_OTHER_ID, type Institution } from "@/domain";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { resolveInstitutionName } from "@/domain/institutions";

export function InstitutionSelect({
  institutions,
  institutionId,
  institutionOther,
  onChange,
  label = "Instituição / banco",
  allowEmpty = true,
}: {
  institutions: Institution[];
  institutionId?: string;
  institutionOther?: string;
  onChange: (next: {
    institutionId?: string;
    institutionOther?: string;
  }) => void;
  label?: string;
  allowEmpty?: boolean;
}) {
  const sorted = [...(institutions ?? [])].sort((a, b) => {
    if (a.id === INSTITUTION_OTHER_ID) return 1;
    if (b.id === INSTITUTION_OTHER_ID) return -1;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return (
    <div className="space-y-1.5">
      {label ? <Label>{label}</Label> : null}
      <Select
        value={institutionId || (allowEmpty ? "_none" : "")}
        onValueChange={(v) => {
          if (v == null || v === "_none") {
            onChange({ institutionId: undefined, institutionOther: undefined });
            return;
          }
          onChange({
            institutionId: v,
            institutionOther:
              v === INSTITUTION_OTHER_ID ? institutionOther : undefined,
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sem instituição">
            {(value: string | null) => {
              if (!value || value === "_none") return "Sem instituição";
              return (
                resolveInstitutionName(
                  value,
                  value === INSTITUTION_OTHER_ID ? institutionOther : undefined,
                  institutions ?? [],
                ) ?? value
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value="_none">Sem instituição</SelectItem>}
          {sorted.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {institutionId === INSTITUTION_OTHER_ID && (
        <Input
          className="mt-1.5"
          placeholder="Nome da instituição"
          value={institutionOther ?? ""}
          onChange={(e) =>
            onChange({
              institutionId: INSTITUTION_OTHER_ID,
              institutionOther: e.target.value,
            })
          }
        />
      )}
    </div>
  );
}

export function InstitutionBadge({
  institutionId,
  institutionOther,
  institutions,
}: {
  institutionId?: string;
  institutionOther?: string;
  institutions: Institution[];
}) {
  const name = resolveInstitutionName(
    institutionId,
    institutionOther,
    institutions,
  );
  if (!name) return null;
  return (
    <Badge variant="secondary" className="font-normal">
      {name}
    </Badge>
  );
}

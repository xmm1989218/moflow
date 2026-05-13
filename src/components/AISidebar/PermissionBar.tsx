import type { PermissionRequest } from "../../lib/permission";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

interface PermissionBarProps {
  request: PermissionRequest;
  onAllow: () => void;
  onAlwaysAllow: () => void;
  onDeny: () => void;
}

export default function PermissionBar({ request, onAllow, onAlwaysAllow, onDeny }: PermissionBarProps) {
  useT();

  let label: string;
  switch (request.permissionKey) {
    case "external_path":
      label = t("permission.accessPath", { path: request.input });
      break;
    case "execute":
      label = t("permission.executeScript", { script: request.input });
      break;
    case "edit":
      label = t("permission.editPath", { path: request.input });
      break;
  }

  return (
    <div className="moflow-ai-permission-bar">
      <span className="moflow-ai-permission-label">{label}</span>
      <div className="moflow-ai-permission-actions">
        <button className="moflow-ai-permission-btn moflow-ai-permission-deny" onClick={onDeny}>
          {t("permission.deny")}
        </button>
        <button className="moflow-ai-permission-btn moflow-ai-permission-allow" onClick={onAllow}>
          {t("permission.allow")}
        </button>
        <button className="moflow-ai-permission-btn moflow-ai-permission-always" onClick={onAlwaysAllow}>
          {t("permission.alwaysAllow")}
        </button>
      </div>
    </div>
  );
}

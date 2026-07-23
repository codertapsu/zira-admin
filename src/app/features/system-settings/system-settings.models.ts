import type { FeatureFlag } from '../../core/api/models';

export type SystemSettingValueType = 'boolean' | 'number' | 'string' | 'enum';
export type SystemSettingAccess = 'admin' | 'admin-or-staff';

export interface SystemSettingResponse {
  key: string;
  value: unknown;
  type: SystemSettingValueType;
  category: string;
  labelKey: string;
  descriptionKey: string;
  gatesFeatureFlag?: FeatureFlag;
  access: SystemSettingAccess;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

import { endpoint, body, json, APIError } from '../../../../lib/api.js';
import { organizationSettingsSchema } from '../../../../lib/validation.js';
import { Organization } from '../../../../models/index.js';
export const PATCH = endpoint(['admin'], async (request, user) => {
  const settings = await body(request, organizationSettingsSchema);
  // The Organization root is scoped by its own _id.
  const organization = await Organization.findOneAndUpdate({ _id: user.organizationId }, { $set: settings }, { new: true, runValidators: true }).select('sundayPaid').lean();
  if (!organization) throw new APIError(404, 'Organization not found');
  return json({ sundayPaid: organization.sundayPaid });
});

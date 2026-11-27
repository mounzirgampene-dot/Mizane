import assert from "node:assert/strict";
import { resolveDocumentStorageScope } from "../js/document-storage-scope.js";
function storage(values = {}) { return { getItem: key => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null }; }
const companyA = resolveDocumentStorageScope({ storage: storage({ mizane_active_company_v1: "company-a", mizane_active_user_v1: "user-1" }), getStatus: () => ({ ok: true, mode: "company", companyId: "company-a", userId: "user-1" }) });
const companyB = resolveDocumentStorageScope({ storage: storage({ mizane_active_company_v1: "company-b", mizane_active_user_v1: "user-1" }), getStatus: () => ({ ok: true, mode: "company", companyId: "company-b", userId: "user-1" }) });
assert.equal(companyA.mode, "company");
assert.notEqual(companyA.databaseSuffix, companyB.databaseSuffix, "deux entreprises doivent utiliser deux coffres distincts");
assert.throws(() => resolveDocumentStorageScope({ storage: storage({ mizane_active_company_v1: "company-b", mizane_active_user_v1: "user-1" }), getStatus: () => ({ ok: false, reason: "mismatch" }) }), /associés de manière vérifiée/);
const localUser1 = resolveDocumentStorageScope({ storage: storage({ mizane_active_user_v1: "user-1" }) });
const localUser2 = resolveDocumentStorageScope({ storage: storage({ mizane_active_user_v1: "user-2" }) });
assert.equal(localUser1.mode, "local");
assert.notEqual(localUser1.databaseSuffix, localUser2.databaseSuffix, "deux utilisateurs locaux doivent avoir des coffres distincts");
assert.throws(() => resolveDocumentStorageScope({ storage: null }), /contexte du coffre/);
console.log("✓ Coffres documentaires : isolation par utilisateur et entreprise validée.");

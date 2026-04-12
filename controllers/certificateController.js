/**
 * certificateController.js — barrel file
 *
 * All logic lives in controllers/certificate/*.js
 * This file only re-exports so that routes/certificateRoutes.js
 * keeps importing from "../controllers/certificateController.js"
 * without any change.
 */

export { uploadAsset }             from "./certificate/assets.js";
export { previewCertificate,
         downloadCertificate,
         downloadBatchZip }        from "./certificate/download.js";
export { matchStudents,
         createCertificateBatch,
         getBatches,
         getMyCertificates,
         deleteBatch }             from "./certificate/batch.js";

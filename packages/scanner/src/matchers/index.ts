import { MatcherRegistry } from "../matcher-registry.js";
import { agentLoopNoCapMatcher } from "./agent-loop-no-cap.js";
import { agentToolDefinitionMatcher } from "./agent-tool-definition.js";
// --- AI / agentic / messaging matchers ---
import { agenticUntrustedPromptInputMatcher } from "./agentic-untrusted-prompt-input.js";
import { algorithmConfusionMatcher } from "./algorithm-confusion.js";
// --- v4 comprehensive entry point matchers ---
import { allRouteHandlersMatcher } from "./all-route-handlers.js";
import { allServerActionsMatcher } from "./all-server-actions.js";
// --- Core security matchers ---
import { authBypassMatcher } from "./auth-bypass.js";
import { cacheKeyPoisoningMatcher } from "./cache-key-poisoning.js";
import { cacheKeyScopeMatcher } from "./cache-key-scope.js";
import { catchAllRouteAuthMatcher } from "./catch-all-route-auth.js";
import { catchallRouterMatcher } from "./catchall-router.js";
import { connectrpcHandlerImplMatcher } from "./connectrpc-handler-impl.js";
import { corsWildcardMatcher } from "./cors-wildcard.js";
import { cronSecretCheckMatcher } from "./cron-secret-check.js";
// --- Finding-driven matchers ---
import { crossTenantIdMatcher } from "./cross-tenant-id.js";
import { cryptoUsageMatcher } from "./crypto-usage.js";
import { dangerousHtmlMatcher } from "./dangerous-html.js";
import { debugEndpointMatcher } from "./debug-endpoint.js";
import { devAuthBypassMatcher } from "./dev-auth-bypass.js";
import { dockerfileCurlPipeUnverifiedMatcher } from "./dockerfile-curl-pipe-unverified.js";
// --- Dockerfile / Go infra matchers ---
import { dockerfileFromMutableTagMatcher } from "./dockerfile-from-mutable-tag.js";
import { dockerfileRunAsRootMatcher } from "./dockerfile-run-as-root.js";
import { drizzleMassAssignmentMatcher } from "./drizzle-mass-assignment.js";
import { drizzleRawSqlMatcher } from "./drizzle-raw-sql.js";
import { envExposureMatcher } from "./env-exposure.js";
import { envVarAsBoolMatcher } from "./env-var-as-bool.js";
import { errorMessageLeakMatcher } from "./error-message-leak.js";
import { eventHandlerMismatchMatcher } from "./event-handler-mismatch.js";
import { expensiveApiAbuseMatcher } from "./expensive-api-abuse.js";
import { frameworkEdgeSandboxMatcher } from "./framework-edge-sandbox.js";
import { frameworkImageOptimizerMatcher } from "./framework-image-optimizer.js";
import { frameworkInternalHeaderMatcher } from "./framework-internal-header.js";
import { frameworkServerActionMatcher } from "./framework-server-action.js";
// --- Framework (Next.js) matchers ---
import { frameworkUntrustedFetchMatcher } from "./framework-untrusted-fetch.js";
import { fsWriteSymlinkBoundaryMatcher } from "./fs-write-symlink-boundary.js";
import { gitProviderUrlInjectionMatcher } from "./git-provider-url-injection.js";
import { githubWorkflowSecurityMatcher } from "./github-workflow-security.js";
import { goCommandInjectionMatcher } from "./go-command-injection.js";
import { goEmbedAssetMatcher } from "./go-embed-asset.js";
import { goHttpHandlerMatcher } from "./go-http-handler.js";
import { goSsrfMatcher } from "./go-ssrf.js";
// --- Authorization / IAM matchers ---
import { iamPermissionsMatcher } from "./iam-permissions.js";
import { insecureCryptoMatcher } from "./insecure-crypto.js";
// --- Auth / sessions / env matchers ---
import { jwtHandlingMatcher } from "./jwt-handling.js";
import { k8sSecretReferenceMatcher } from "./k8s-secret-reference.js";
import { k8sSecretsInitContainerMatcher } from "./k8s-secrets-init-container.js";
import { luaCryptoWeaknessMatcher } from "./lua-crypto-weakness.js";
import { luaNgxExecMatcher } from "./lua-ngx-exec.js";
import { luaRegexBypassMatcher } from "./lua-regex-bypass.js";
import { luaSharedDictPoisoningMatcher } from "./lua-shared-dict-poisoning.js";
// --- Lua / Go / proxy matchers ---
import { luaStringConcatUrlMatcher } from "./lua-string-concat-url.js";
import { mcpToolHandlerMatcher } from "./mcp-tool-handler.js";
import { missingAuthMatcher } from "./missing-auth.js";
import { missingAwaitMatcher } from "./missing-await.js";
import { nextjsMiddlewareMatcher } from "./nextjs-middleware.js";
import { nextjsMiddlewareOnlyAuthMatcher } from "./nextjs-middleware-only-auth.js";
import { nonAtomicOperationMatcher } from "./non-atomic-operation.js";
import { nonAtomicReadDeleteMatcher } from "./non-atomic-read-delete.js";
import { oauthFlowMatcher } from "./oauth-flow.js";
import { objectInjectionMatcher } from "./object-injection.js";
import { openRedirectMatcher } from "./open-redirect.js";
// --- v3 brainstormed matchers ---
import { pageDataFetchMatcher } from "./page-data-fetch.js";
import { pageWithoutAuthFetchMatcher } from "./page-without-auth-fetch.js";
import { pathTraversalMatcher } from "./path-traversal.js";
import { postmessageOriginMatcher } from "./postmessage-origin.js";
import { prismaRawSqlMatcher } from "./prisma-raw-sql.js";
import { processEnvAccessMatcher } from "./process-env-access.js";
import { promptLeaksSystemPromptMatcher } from "./prompt-leaks-system-prompt.js";
// --- ConnectRPC / proto / Unix-socket matchers ---
import { protoRpcSurfaceMatcher } from "./proto-rpc-surface.js";
// --- Endpoint / handler matchers ---
import { publicEndpointMatcher } from "./public-endpoint.js";
import { rateLimitBypassMatcher } from "./rate-limit-bypass.js";
import { rceMatcher } from "./rce.js";
import { responseHeaderLeakMatcher } from "./response-header-leak.js";
import { sandboxRuntimeScriptMatcher } from "./sandbox-runtime-script.js";
import { secretEnvVarMatcher } from "./secret-env-var.js";
import { secretInFallbackMatcher } from "./secret-in-fallback.js";
import { secretInLogMatcher } from "./secret-in-log.js";
import { secretsExposureMatcher } from "./secrets-exposure.js";
// --- Secrets management matchers ---
import { secretsPlaintextExposureMatcher } from "./secrets-plaintext-exposure.js";
import { securityBehindFlagMatcher } from "./security-behind-flag.js";
import { sensitiveDataInTracesMatcher } from "./sensitive-data-in-traces.js";
import { serverActionMatcher } from "./server-action.js";
import { serverActionNoAuthMatcher } from "./server-action-no-auth.js";
import { serviceEntryPointMatcher } from "./service-entry-point.js";
import { sessionCookieConfigMatcher } from "./session-cookie-config.js";
import { slackSigningVerificationMatcher } from "./slack-signing-verification.js";
import { snowflakeBigquerySqlMatcher } from "./snowflake-bigquery-sql.js";
import { soqlInjectionMatcher } from "./soql-injection.js";
import { spreadOperatorInjectionMatcher } from "./spread-operator-injection.js";
import { sqlInjectionMatcher } from "./sql-injection.js";
import { ssrfMatcher } from "./ssrf.js";
import { streamingEndpointMatcher } from "./streaming-endpoint.js";
import { testHeaderBypassMatcher } from "./test-header-bypass.js";
import { tfEncryptionMissingMatcher } from "./tf-encryption-missing.js";
import { tfIacSurfaceMatcher } from "./tf-iac-surface.js";
// --- Terraform / IaC matchers ---
import { tfIamWildcardMatcher } from "./tf-iam-wildcard.js";
import { tfModuleUnpinnedMatcher } from "./tf-module-unpinned.js";
import { tfPublicIngressMatcher } from "./tf-public-ingress.js";
import { tfSecretInDataMatcher } from "./tf-secret-in-data.js";
import { trpcPublicProcedureMatcher } from "./trpc-public-procedure.js";
import { unixSocketListenerMatcher } from "./unix-socket-listener.js";
import { unsafeDeserializationMatcher } from "./unsafe-deserialization.js";
import { unsafeJsonInHtmlMatcher } from "./unsafe-json-in-html.js";
import { unsafeRedirectMatcher } from "./unsafe-redirect.js";
import { untrustedRedirectFollowingMatcher } from "./untrusted-redirect-following.js";
// --- v2 finding-driven matchers ---
import { unverifiedLookupMatcher } from "./unverified-lookup.js";
import { urlRegexValidationMatcher } from "./url-regex-validation.js";
import { useServerExportMatcher } from "./use-server-export.js";
import { webhookHandlerMatcher } from "./webhook-handler.js";
import { xssMatcher } from "./xss.js";
import { zodPassthroughMassAssignmentMatcher } from "./zod-passthrough-mass-assignment.js";

export function createDefaultRegistry(): MatcherRegistry {
  const registry = new MatcherRegistry();

  // Core security
  registry.register(authBypassMatcher);
  registry.register(missingAuthMatcher);
  registry.register(xssMatcher);
  registry.register(rceMatcher);
  registry.register(sqlInjectionMatcher);
  registry.register(ssrfMatcher);
  registry.register(pathTraversalMatcher);
  registry.register(secretsExposureMatcher);
  registry.register(insecureCryptoMatcher);
  registry.register(openRedirectMatcher);

  // Endpoint / handler
  registry.register(publicEndpointMatcher);
  registry.register(serviceEntryPointMatcher);
  registry.register(webhookHandlerMatcher);

  // Authorization / IAM
  registry.register(iamPermissionsMatcher);
  registry.register(serverActionMatcher);
  registry.register(unsafeRedirectMatcher);
  registry.register(dangerousHtmlMatcher);

  // Auth / sessions / env
  registry.register(jwtHandlingMatcher);
  registry.register(envExposureMatcher);
  registry.register(rateLimitBypassMatcher);

  // Finding-driven
  registry.register(crossTenantIdMatcher);
  registry.register(secretInFallbackMatcher);
  registry.register(secretInLogMatcher);
  registry.register(urlRegexValidationMatcher);
  registry.register(gitProviderUrlInjectionMatcher);
  registry.register(cronSecretCheckMatcher);
  registry.register(useServerExportMatcher);
  registry.register(nextjsMiddlewareOnlyAuthMatcher);

  // Lua / Go / proxy
  registry.register(luaStringConcatUrlMatcher);
  registry.register(luaNgxExecMatcher);
  registry.register(luaSharedDictPoisoningMatcher);
  registry.register(luaRegexBypassMatcher);
  registry.register(luaCryptoWeaknessMatcher);
  registry.register(goHttpHandlerMatcher);
  registry.register(goSsrfMatcher);
  registry.register(goCommandInjectionMatcher);
  registry.register(cacheKeyPoisoningMatcher);
  registry.register(secretEnvVarMatcher);

  // v2 finding-driven
  registry.register(unverifiedLookupMatcher);
  registry.register(catchAllRouteAuthMatcher);
  registry.register(serverActionNoAuthMatcher);
  registry.register(oauthFlowMatcher);
  registry.register(securityBehindFlagMatcher);

  // v3 brainstormed
  registry.register(pageDataFetchMatcher);
  registry.register(spreadOperatorInjectionMatcher);
  registry.register(nonAtomicOperationMatcher);
  registry.register(debugEndpointMatcher);
  registry.register(postmessageOriginMatcher);
  registry.register(algorithmConfusionMatcher);
  registry.register(objectInjectionMatcher);
  registry.register(envVarAsBoolMatcher);
  registry.register(responseHeaderLeakMatcher);
  registry.register(corsWildcardMatcher);
  registry.register(unsafeDeserializationMatcher);
  registry.register(pageWithoutAuthFetchMatcher);
  registry.register(unsafeJsonInHtmlMatcher);

  // v4 comprehensive entry point
  registry.register(allRouteHandlersMatcher);
  registry.register(allServerActionsMatcher);
  registry.register(nextjsMiddlewareMatcher);
  registry.register(catchallRouterMatcher);
  registry.register(agentToolDefinitionMatcher);
  registry.register(devAuthBypassMatcher);
  registry.register(streamingEndpointMatcher);
  registry.register(expensiveApiAbuseMatcher);
  registry.register(processEnvAccessMatcher);
  registry.register(missingAwaitMatcher);
  registry.register(sensitiveDataInTracesMatcher);
  registry.register(cacheKeyScopeMatcher);
  registry.register(nonAtomicReadDeleteMatcher);
  registry.register(testHeaderBypassMatcher);
  registry.register(eventHandlerMismatchMatcher);
  registry.register(errorMessageLeakMatcher);

  // Dockerfile / Go infra
  registry.register(dockerfileFromMutableTagMatcher);
  registry.register(dockerfileCurlPipeUnverifiedMatcher);
  registry.register(dockerfileRunAsRootMatcher);
  registry.register(cryptoUsageMatcher);

  // Secrets management
  registry.register(secretsPlaintextExposureMatcher);
  registry.register(k8sSecretReferenceMatcher);
  registry.register(k8sSecretsInitContainerMatcher);

  // ConnectRPC / proto / Unix-socket
  registry.register(protoRpcSurfaceMatcher);
  registry.register(connectrpcHandlerImplMatcher);
  registry.register(unixSocketListenerMatcher);
  registry.register(sandboxRuntimeScriptMatcher);
  registry.register(goEmbedAssetMatcher);
  registry.register(githubWorkflowSecurityMatcher);

  // Terraform / IaC
  registry.register(tfIamWildcardMatcher);
  registry.register(tfPublicIngressMatcher);
  registry.register(tfEncryptionMissingMatcher);
  registry.register(tfSecretInDataMatcher);
  registry.register(tfModuleUnpinnedMatcher);
  registry.register(tfIacSurfaceMatcher);

  // Framework (Next.js)
  registry.register(frameworkUntrustedFetchMatcher);
  registry.register(frameworkInternalHeaderMatcher);
  registry.register(frameworkServerActionMatcher);
  registry.register(frameworkImageOptimizerMatcher);
  registry.register(frameworkEdgeSandboxMatcher);

  // AI / agentic / messaging
  registry.register(agenticUntrustedPromptInputMatcher);
  registry.register(drizzleRawSqlMatcher);
  registry.register(soqlInjectionMatcher);
  registry.register(snowflakeBigquerySqlMatcher);
  registry.register(mcpToolHandlerMatcher);
  registry.register(slackSigningVerificationMatcher);
  registry.register(drizzleMassAssignmentMatcher);
  registry.register(sessionCookieConfigMatcher);
  registry.register(zodPassthroughMassAssignmentMatcher);
  registry.register(untrustedRedirectFollowingMatcher);
  registry.register(agentLoopNoCapMatcher);
  registry.register(promptLeaksSystemPromptMatcher);
  registry.register(fsWriteSymlinkBoundaryMatcher);
  registry.register(prismaRawSqlMatcher);
  registry.register(trpcPublicProcedureMatcher);

  return registry;
}

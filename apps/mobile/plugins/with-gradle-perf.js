const { withGradleProperties } = require("expo/config-plugins");

/**
 * Local Gradle speed-ups for the generated android/ project. `android/` is
 * gitignored and rebuilt by `expo prebuild`, so these live here rather than in
 * the checked-in tree. Keys are set in place (no duplicates on re-prebuild).
 * - build cache + parallel: reuse task outputs across builds
 * - capped heap and 2 workers: keeps the laptop responsive while Gradle runs
 * Configuration cache is deliberately off: AGP 9 / Kotlin 2.4 / RN plugins are
 * not verified against it yet.
 */
const GRADLE_PERF = {
  "org.gradle.caching": "true",
  "org.gradle.parallel": "true",
  "org.gradle.workers.max": "2",
  // biome-ignore lint/security/noSecrets: JVM heap flags, not a credential
  "org.gradle.jvmargs": "-Xmx3g -XX:MaxMetaspaceSize=512m",
};

function withGradlePerf(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults;
    for (const [key, value] of Object.entries(GRADLE_PERF)) {
      const existing = props.find((p) => p.type === "property" && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        props.push({ type: "property", key, value });
      }
    }
    return mod;
  });
}

module.exports = withGradlePerf;

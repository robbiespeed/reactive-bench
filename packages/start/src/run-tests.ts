import { frameworkConfigs, testConfigs } from "#lib/config";
import { runTestSuite } from "@reactive-bench/core/test.ts";

runTestSuite(frameworkConfigs, testConfigs);

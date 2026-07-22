/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { readFileSync } from 'fs'
import os from 'os'
import pkgUp from 'pkg-up'

const ignoredIncomingPaths = ['/health/ready']

function getRequestPath(url = '') {
  return url.split('?')[0]
}

function getServiceName(packageJsonPath: string) {
  const packageName = JSON.parse(readFileSync(packageJsonPath, 'utf8')).name

  return (
    process.env.OTEL_SERVICE_NAME ||
    packageName?.replace('@', '').replace('/', '_') ||
    'opencrvs'
  )
}

function getResource(packageJsonPath: string) {
  return resourceFromAttributes({
    'service.name': getServiceName(packageJsonPath),
    'deployment.environment':
      process.env.OTEL_DEPLOYMENT_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development',
    'host.name': os.hostname(),
    'container.id': process.env.HOSTNAME || '',
    'k8s.node.name': process.env.OTEL_NODE_NAME || ''
  })
}

function initSdk(packageJsonPath: string) {
  const sdk = new NodeSDK({
    resource: getResource(packageJsonPath),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-hapi': {
          enabled: false
        },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (request) =>
            ignoredIncomingPaths.includes(getRequestPath(request.url))
        }
      })
    ]
  })

  sdk.start()

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0))
  })
}

function init() {
  if (process.env.NODE_ENV === 'production') {
    const path = pkgUp.sync()

    initSdk(path!)
  }
}
init()

'use strict'

const BbPromise = require('bluebird')
const run = require('./run')

const noOp = () => (undefined)

const invoke = (func, event, lambdaEndpoint, logger) => {
  const log = logger || noOp

  log(`Invoking function ${func.handler}`)

  const memorySize = func.memorySize || 1024
  
  const coreImage = func.dockerImage || 'lambci/lambda'

  const dockerImage = func.runtime ? `${coreImage}:${func.runtime}` : coreImage
  const dockerArgs = [
    '-m', `${memorySize}M`,
  ]

  const network = func.projectName ? `${func.projectName}_default` : ''
  if (network) {
    dockerArgs.push('--network')
    dockerArgs.push(network)
  } else {
    dockerArgs.push('--network')
    dockerArgs.push('host')
  }

  const simulateEnvironment = {
    AWS_LAMBDA_FUNCTION_NAME: func.key,
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: memorySize,
    AWS_LAMBDA_FUNCTION_TIMEOUT: func.timeout || 6,
    AWS_LAMBDA_LOG_GROUP_NAME: `/aws/lambda/${func.key}`,
    AWS_REGION: func.region,
    SERVERLESS_SIMULATE: true,
    SERVERLESS_SIMULATE_STAGE: func.stage,
  }

  if (lambdaEndpoint) {
    simulateEnvironment.SERVERLESS_SIMULATE_LAMBDA_ENDPOINT = lambdaEndpoint
  }

  const env = Object.assign(
    {},
    func.environment || {},
    simulateEnvironment
  )

  Object.keys(env).forEach((key) => {
    const value = env[key]

    dockerArgs.push('-e')
    dockerArgs.push(`${key}=${value}`)
  })

  return run({
    handler: func.handler,
    event,
    addEnvVars: true,
    dockerImage,
    dockerArgs,
    taskDir: func.servicePath,
    cleanUp: true,
    returnSpawnResult: true,
  }).then((result) => {
    try {
      const output = result.stdout ? JSON.parse(result.stdout) : null

      if (output && output.errorMessage !== null && output.errorMessage !== undefined) {
        return BbPromise.reject(new Error(output.errorMessage))
      }

      return BbPromise.resolve(output)
    } catch (err) {
      log(err)

      return BbPromise.reject(new Error('Error executing function'))
    }
  })
}

module.exports = (lambdaEndpoint) => ({
  invoke: (func, event, logger) => invoke(func, event, lambdaEndpoint, logger),
})

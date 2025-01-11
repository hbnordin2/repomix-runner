import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import { logger } from '../shared/logger';
import { exec } from 'child_process';
import { mergeConfigs } from '../config/configLoader';
import { getCwd } from '../config/getCwd';
import { copyToClipboard, cleanOutputFile, cleanupTempFile } from '../core/files';
import { generateCliFlags } from '../core/cli/generateCliFlags';
import { showTempNotification } from '../shared/showTempNotification';
import { readRepomixFileConfig } from '../config/configLoader';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader';

export async function runRepomix(uri: vscode.Uri): Promise<void> {
  const cwd = getCwd();
  const targetDir = uri.fsPath;

  // Load config and write repomix command with corresponding flags
  const vscodeConfig = readRepomixRunnerVscodeConfig();
  const configFile = await readRepomixFileConfig(cwd);
  const config = mergeConfigs(cwd, configFile, vscodeConfig, targetDir);

  const cliFlags = generateCliFlags(config);

  const cmd = `npx -y repomix "${config.targetDir}" ${cliFlags}`;

  logger.both.debug('config: \n', config);
  logger.both.debug('cmd: \n', cmd);
  logger.both.debug('cwd: \n', cwd);

  const execPromise = util.promisify(exec);

  try {
    const cmdPromise = execPromise(cmd, { cwd: cwd });

    showTempNotification(`⚙️ Running Repomix in "${config.targetDirBasename}" ...`, {
      promise: cmdPromise,
    });

    const { stderr, stdout } = await cmdPromise;

    if (stdout) {
      logger.both.info('stdout: \n', stdout);
    }

    if (stderr) {
      logger.both.error('stderr: \n', stderr);
    }

    const tmpFilePath = path.join(
      os.tmpdir(),
      'repomix_' + config.targetPathRelative.split('/').join('_')
    );

    await copyToClipboard(config.output.filePath, tmpFilePath);

    showTempNotification(
      `✅ Repomix successfully executed in "${config.targetDirBasename}",
       details in output`,
      {
        duration: 5000,
        cancellable: true,
      }
    );

    await cleanOutputFile(config.output.filePath, config.runner.keepOutputFile);

    cleanupTempFile(tmpFilePath).catch(error => {
      logger.both.error('Error cleaning up temp file:', error);
    });
  } catch (error: any) {
    logger.both.error(error);
    vscode.window.showErrorMessage(error.message);
    throw error;
  }
}

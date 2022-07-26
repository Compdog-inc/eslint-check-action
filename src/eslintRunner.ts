import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { error as logError, notice as logNotice } from '@actions/core';
import { ESLint } from 'eslint';
import path from 'path';

class EslintRunner {
  private name = 'Eslint Run';

  private kit: InstanceType<typeof GitHub>;

  private opts: ActionOptionsType;

  checkRunID: number = -1;

  constructor(ghToken: string, options: ActionOptionsType) {
    this.kit = github.getOctokit(ghToken);
    this.opts = options;
  }

  run = async () => {
    this.checkRunID = await this.startGitHubCheck();
    const report = await this.runEslintCheck()!;
    const { success, annotations, counts } = this.prepareAnnotation(report);

    // if annotations are too large, split them into check-updates
    let restOfAnnotation = await this.handleAnnotations(annotations, counts);

    this.finishGitHubCheck(success, restOfAnnotation, counts);
  };

  private handleAnnotations = async (
    annotations: Array<GitHubAnnotation>,
    counts: ReportCounts
  ) => {
    let leftAnnotations = [...annotations];
    if (leftAnnotations.length > 50) {
      while (leftAnnotations.length > 50) {
        let toProcess = leftAnnotations.splice(0, 50);
        try {
          await this.updateAnnotation(toProcess, counts);
        } catch (e) {
          exitWithError(`Fail processing annotations: ${e.message}`);
        }
      }
    }
    return leftAnnotations;
  };

  private updateAnnotation = async (
    annotations: Array<GitHubAnnotation>,
    counts: ReportCounts
  ) => {
    try {
      await this.kit.rest.checks.update({
        owner: this.opts.repoOwner,
        repo: this.opts.repoName,
        check_run_id: this.checkRunID,
        status: 'in_progress',
        output: {
          title: this.name,
          summary: `Found ${counts.error} error(s), ${counts.warning} warning(s).`,
          annotations,
        },
      });
    } catch (e) {
      exitWithError(e.message);
    }
  };

  private startGitHubCheck = async () => {
    let runId = -1;
    try {
      const response = await this.kit.rest.checks.create({
        name: this.name,
        head_sha: this.opts.prSha,
        repo: this.opts.repoName,
        owner: this.opts.repoOwner,
        started_at: new Date().toISOString(),
        status: 'in_progress',
      });

      runId = response.data.id;
    } catch (e) {
      exitWithError(e.message);
    }

    return runId;
  };

  private finishGitHubCheck = async (
    success: boolean,
    annotations: Array<GitHubAnnotation>,
    counts: ReportCounts
  ) => {
    try {
      await this.kit.rest.checks.update({
        owner: this.opts.repoOwner,
        repo: this.opts.repoName,
        check_run_id: this.checkRunID,
        status: 'completed',
        completed_at: new Date().toISOString(),
        conclusion: success ? 'success' : 'failure',
        output: {
          title: this.name,
          summary: `Found ${counts.error} error(s), ${counts.warning} warning(s).`,
          annotations,
        },
      });
    } catch (e) {
      exitWithError(e.message);
    }
  };

  private pathRelative = (location: string) => {
    return path.resolve(this.opts.repoPath, location);
  };

  private runEslintCheck = async () => {
    const cliOptions: ESLint.Options = {
      useEslintrc: false,
      overrideConfigFile: this.pathRelative(this.opts.eslintConfig),
      extensions: this.opts.eslintExtensions,
      cwd: this.opts.repoPath,
    };

    try {

      const cli = new ESLint(cliOptions);
      const lintFiles = this.opts.eslintFiles.map(this.pathRelative);

      return await cli.lintFiles(lintFiles);
    } catch (e) {
      exitWithError(e.message);

      return null;
    }
  };

  private prepareAnnotation = (results: ESLint.LintResult[] | null) => {
    // 0 - no error, 1 - warning, 2 - error
    const reportLevel = ['', 'warning', 'failure'];

    const githubAnnotations: Array<GitHubAnnotation> = [];

    let errorCount = 0;
    let warningCount = 0;

    if (results !== null) {
      results.forEach(result => {
        errorCount += result.errorCount;
        warningCount += result.warningCount;

        const { filePath, messages } = result;
        const path = filePath.replace(`${this.opts.repoPath}/`, '');

        for (let msg of messages) {
          const { ruleId, message, severity, endLine, line } = msg;

          const annotation: GitHubAnnotation = {
            path,
            start_line: line || 0,
            end_line: endLine || line || 0,
            annotation_level: reportLevel[severity] as GitHubAnnotationLevel,
            message: `${ruleId}: ${message}`,
          };

          githubAnnotations.push(annotation);
        }
      });
    }

    return {
      success: errorCount === 0,
      annotations: githubAnnotations,
      counts: {
        error: errorCount,
        warning: warningCount,
      },
    };
  };
}

function exitWithError(errorMessage: string) {
  logError(errorMessage);
  process.exit(1);
}

export default EslintRunner;

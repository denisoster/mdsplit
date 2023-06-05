const fs = require('fs')
const path = require('path')
const { Line } = require('./line')
const { program } = require('commander')
const slugify = require('slugify')

async function generateTableOfContents(chapters, slugOptions) {
  let toc = ''
  let prevParentHeadings = []

  for (const chapter of chapters) {
    const { heading, parentHeadings } = chapter
    const headingTitle = heading ? heading.headingTitle : 'Unknown Heading'

    let indentLevel = 0
    while (
      indentLevel < parentHeadings.length &&
      indentLevel < prevParentHeadings.length &&
      parentHeadings[indentLevel] === prevParentHeadings[indentLevel]
      ) {
      indentLevel++
    }

    const indent = '  '.repeat(indentLevel)

    toc += `${indent}- [${headingTitle}](#${slugifySanitize(headingTitle, slugOptions)})\n`

    prevParentHeadings = parentHeadings
  }

  return toc
}

async function splitByHeading(text, maxLevel) {
  const currParentHeadings = Array(6).fill(null)
  let currHeadingLine = null
  let currLines = []
  let withinFence = false

  const chapters = []

  for (const line of text.split('\n')) {
    const nextLine = new Line(line)

    if (nextLine.isFence()) {
      withinFence = !withinFence
    }

    const isChapterFinished =
      !withinFence &&
      nextLine.isHeading() &&
      nextLine.headingLevel <= maxLevel

    if (isChapterFinished) {
      if (currLines.length > 0) {
        const parents = detectParents(currParentHeadings, currHeadingLine)
        const chapter = {
          parentHeadings: parents,
          heading: currHeadingLine,
          text: currLines
        }
        chapters.push(chapter)

        if (currHeadingLine !== null) {
          const currLevel = currHeadingLine.headingLevel
          currParentHeadings[currLevel - 1] =
            currHeadingLine.headingTitle
          for (let level = currLevel; level < 6; level++) {
            currParentHeadings[level] = null
          }
        }
      }

      currHeadingLine = nextLine
      currLines = []
    }

    currLines.push(nextLine.fullLine)
  }

  const parents = detectParents(currParentHeadings, currHeadingLine)
  const chapter = {
    parentHeadings: parents,
    heading: currHeadingLine,
    text: currLines
  }
  chapters.push(chapter)

  return chapters
}

function detectParents(parentHeadings, headingLine) {
  if (headingLine === null) {
    return []
  }

  const parents = []
  for (let level = 0; level < headingLine.headingLevel - 1; level++) {
    if (parentHeadings[level] !== null) {
      parents.push(parentHeadings[level])
    }
  }

  return parents
}

function filenameSanitize(value) {
  return value.replace(/[/\\?%*:|"<>]/g, '-')
}

function slugifySanitize(value, options) {
  return slugify(value, options)
}

async function processStream(
  inputFilePath,
  maxLevel,
  fallbackOutFileName,
  outputPath,
  force,
  verbose,
  slug,
  slugOptions,
  toc
) {
  // Input validation
  if (!inputFilePath || !outputPath) {
    throw new Error('Input file and output folder paths are required')
  }

  if (!fs.existsSync(inputFilePath)) {
    throw new Error(`Input file '${inputFilePath}' does not exist`)
  }

  if (fs.existsSync(outputPath) && !force) {
    throw new Error(`Output directory '${outputPath}' already exists`)
  }

  if (fs.existsSync(outputPath) && force) {
    fs.rmSync(outputPath, { recursive: true })
    console.log(`Removed already existing directory '${outputPath}'`)
  }

  const inputStream = fs.readFileSync(inputFilePath, 'utf8')
  const outputFolderPath = fs.mkdirSync(outputPath, { recursive: true })

  console.log(`Create output folder '${outputPath}'`)
  console.log(`Process file '${inputFilePath}' to '${outputFolderPath}'`)

  const chapters = await splitByHeading(inputStream, maxLevel)

  if (toc) {
    const tocContent = await generateTableOfContents(chapters, slugOptions)
    const tocFilePath = path.join(outputPath, 'toc.md')

    fs.writeFileSync(tocFilePath, tocContent)
    console.log(`Table of Contents saved to '${tocFilePath}'`)

    if (verbose) {
      console.log('\nTable of Contents:')
      console.log(tocContent)
    }
  }

  for (const chapter of chapters) {
    let chapterDir = outputFolderPath
    for (const parent of chapter.parentHeadings) {
      chapterDir = path.join(chapterDir, filenameSanitize(parent))
    }
    fs.mkdirSync(chapterDir, { recursive: true })

    let chapterFilename =
      fallbackOutFileName ||
      (chapter.heading === null
        ? 'stdin.md'
        : `${filenameSanitize(chapter.heading.headingTitle)}.md`)

    if (slug) {
      chapterFilename = slugifySanitize(chapterFilename, slugOptions)
    }

    chapterFilename = path.join(chapterDir, chapterFilename)

    if (verbose) {
      console.log(`Write ${chapter.text.length} lines to '${chapterFilename}'`)
    }

    fs.writeFileSync(chapterFilename, chapter.text.join('\n'))
  }

  console.log('Splitting result:')
  console.log(`- 1 input file(s) (${inputFilePath})`)
  console.log(`- ${chapters.length} extracted chapter(s)`)
  console.log(`- ${chapters.length} new output file(s) (${outputFolderPath})`)
}

async function main() {
  program
    .option('-i, --input [file]', 'file path')
    .option('-o, --output [folder]', 'output folder path')
    .option('-l, --level <number>', 'heading level 1–6', str => parseInt(str), 1)
    .option('-t, --toc', 'table of contents')
    .option('-f, --force', 'overwrite output')
    .option('-s, --slugify', 'generate slugify filenames and folders')
    .option('-v, --verbose', 'verbose output')
    .parse(process.argv)

  const options = program.opts()
  const input = options.input
  const output = options.output
  const level = options.level
  const toc = options.toc || false
  const force = options.force || false
  const slug = options.slugify || false
  const verbose = options.verbose || false
  const inputFilePath = path.resolve(input)
  const defaultOutputPath = path.join(
    path.dirname(inputFilePath),
    path.basename(inputFilePath, path.extname(inputFilePath))
  )
  const outputPath = output ? path.resolve(output) : defaultOutputPath

  const slugOptions = { lower: true, replacement: '-', locale: 'la' }

  try {
    await processStream(
      inputFilePath,
      level,
      null,
      outputPath,
      force,
      verbose,
      slug,
      slugOptions,
      toc
    )
  } catch (error) {
    console.error('An error occurred:', error.message)
    process.exit(1)
  }
}

main()

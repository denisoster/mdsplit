class Line {
  constructor(fullLine) {
    this.fullLine = fullLine.trim()
    this.headingLevel = this.__getHeadingLevel()
    this.headingTitle = this.__getHeadingTitle()
  }

  isFence() {
    return this.fullLine.startsWith('```')
  }

  isHeading() {
    return this.fullLine.startsWith('#')
  }

  __getHeadingLevel() {
    if (!this.isHeading()) {
      return 0
    }

    const match = this.fullLine.match(/^(#+)\s/)
    return match ? match[1].length : 0
  }

  __getHeadingTitle() {
    if (!this.isHeading()) {
      return ''
    }

    return this.fullLine.replace(/^(#+)\s/, '').trim()
  }
}

module.exports = {
  Line
}

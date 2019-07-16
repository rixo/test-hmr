{
  const pos = o => {
    const {start: {offset: start}, end: {offset: end}} = location()
    return {start, end}
  }

  const conds = parts => [...new Set(
    parts.map(({condition}) => condition).filter(Boolean)
  )]
}

Start
  = Spec

FullSpec
  = title:SpecTitle spec:Spec { return { title, ...spec } }

Spec
  = __ files:File* expectations:Expectations? {
    return {
      files,
      expectations
    }
  }

TitleOnly
  = title:SpecTitle __ .* { return { title } }

SpecTitle "title"
  = __ "#" _ title:Line { return title.trim() }

File "file spec"
  = _ cmd:FileCommandLine content:FileContent { return {...cmd, content} }

FileContent "file content"
  = parts:(Condition / Text)* { return { ...pos(), parts, conditions: conds(parts) } }

Expectations "expectations"
  = _ body:ExpectationsBody { return body }

ExpectationsBody
  = ExpectationSeparator EOC content:FileContent? { return content }

Text "text block"
  = (!FileCommand Line)+ { return { text: text(), ...pos() } }

FileCommand
  = File
  / Condition
  / ExpectationSeparator

Line
  = (!EOL.)+ EOL? { return text() }
  / EOL

Condition
  = MultiLineCondition
  / SingleLineCondition

SingleLineCondition
  = _ body:SingleConditionBody { return body }

SingleConditionBody
  = "::" condition:Label !"::" _ content:ConditionContent {
    return {
      condition,
      text: content.text,
      content,
      block: false,
      ...pos()
    }
  }

MultiLineCondition
  = _ body:MultiLineConditionBody { return body }

MultiLineConditionBody
  = label:MultiLineConditionLabel
    content:MultiLineConditionContent
    EndOfMultiLineCondition
    { return { condition: label, text: content.text, content, block: true, ...pos() } }

EndOfMultilineCommand
  = _ "::" ":"* _

MultiLineConditionLabel
  = "::" _ label:$(!EndOfMultilineCommand .)+ EndOfMultilineCommand EOL { return label }

MultiLineConditionContent
  = $ (!EndOfMultiLineCondition Line)* { return { text: text(), ...pos() } }

EndOfMultiLineCondition
  = (& Condition / EndOfMultilineCommand EOL? / EOF)

ConditionContent
  //= text:ConditionContentBlock "\n"? { return { text, ...pos() } }
  = text:Line? { return { text, ...pos() } }

ConditionContentBlock
  = "{" text:$([^}] / ConditionContentBlock)* "}" { return text }

Label
  = "'" text:[^']+ "'" { return text }
  / '"' text:[^"]+ '"' { return text }
  / $( (!"::" [^ \t\n:]) (!"::" [^ \t\n:])* )

FileCommandLine
  = '----''-'* _ path:PathName _ '-'* _ EOC {
  	return { path }
  }

ExpectationSeparator
  = _ "****" "*"*

PathName "path name"
  = '"' path:($ [^"]+) '"' { return path }
  / "'" path:($ [^']+) "'" { return path }
  / $ [^ ]+

WhiteSpace "whitespace"
  = "\t"
  / "\v"
  / "\f"
  / " "
  / "\u00A0"
  / "\uFEFF"
  / Zs

_
  = WhiteSpace*

__
  = (WhiteSpace / "\n")*

Zs = [\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]

EOL "end of line"
  = "\n"

EOF
  = !.

// End Of Command
EOC
  = EOL
  / EOF

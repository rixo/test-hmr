{
  const pos = o => {
    const {start: {offset: start}, end: {offset: end}} = location()
    return {start, end}
  }
}

Start
  = Spec

Spec
  = __ files:File* expectations:Expectations? {
    return {
      files,
      expectations
    }
  }

File "file spec"
  = _ cmd:FileCommandLine content:FileContent { return {...cmd, content} }

FileContent "file content"
  = parts:(Condition / Text)* { return { ...pos(), parts } }

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
  = _ body:ConditionBody { return body }

ConditionBody
  = "::" condition:Label _ content:ConditionContent? {
    return {
      condition,
      text: content && content.text || undefined,
      content,
      ...pos()
    }
  }

ConditionContent
  = "{" text:$[^}]* "}" "\n"? { return { text, ...pos() } }
  / text:Line { return { text, ...pos() } }

Label
  = $ [^ \t]+
  / "'" [^']+ "'"
  / '"' [^"]+ '"'

FileCommandLine
  = '----''-'* _ path:PathName _ '-'* _ EOC {
  	return { path }
  }

ExpectationSeparator
  = "****" "*"*

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
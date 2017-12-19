# Test Title

> stage: advanced
> description: description

---
> id: test1

## Passage 1 {#id .class attr=value}

Here is a paragraph with _italic_, __bold__, ^suberscript^ and ~subscript~,
as well as emoji: :smile: and :penguin:

Here is a paragraph with [Biographies](bio:gauss) of [People](bio:euler),
[Glossary entries](gloss:polygon), [External links](https://mathigon.org), and
[Targets](-> #id .class).

Here is a paragraph with [[blanks|gaps]] and [[100]] input, as well as
variables like ${x|1|0,1,10}{x} and ${x}. You can also have _{span.class} blanks
inside [[a|b|c]] tags_.

Here is a paragraph with maths: `x^2 + 4x - 20/2`{#m .my-math}.

Here is a paragraph with classes: _red_{.red} {#p.red-wrap(data-value=10)}

Here is a special _inline element_{small}

---

Here is another section

<div class="row">
  Here is HTML that contains __bold__ and [[blanks|text]].
  <div>Also, _nested_ HTML!</div>
</div>
<div>More [link](url) text</div>

* list item {.item1}
* list item with _italic_ and [[blanks|gaps]]{.blank1} {.item2}
{.list}

---
> id: test2

Here are PUG includes

    include include.svg

and PUG code

    .row

---

Here is a paragraph

::: article.row
Here is an _indented_ block

::: .nested
More __text__
:::

More text
:::

More text 

---

::: column(width=410)
Right Triangle: When a triangle has one right angle.
::: column.grow
Obtuse Triangle: When a triangle has one obtuse angle.
::: column
Acute Triangle: When all three angles in the triangle are acute.
:::

Here is a paragraph

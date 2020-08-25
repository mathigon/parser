# Test Title

## Section 1 

> id: step1
> section: section1

Here is a paragraph with _italic_, __bold__, ^suberscript^ and ~subscript~,
as well as emoji: :smile: and :penguin:

Here is a paragraph with [Biographies](bio:gauss) of [People](bio:euler),
[Glossary entries](gloss:polygon), [External links](https://mathigon.org), and
[Targets](->#step1).

Here is a paragraph with [[blanks|gaps]] and [[100]] inputs, and inputs with
[[200 (hints!)]], as well as variables like ${x|1|0,1,10}{x} and ${x}. You
can also have _{span.class} blanks inside [[a|b|c]] tags_.

Here is a paragraph with maths: `x^2 + 4x - 20/2`.

{.red-wrap(data-value=10)} Here is a paragraph with classes: _{.red} red_

Here is a special _{small} inline element_

---
> id: step2

A **matrix** is a rectangular array of numbers: 

Escape 20\$ and \$20 and $20 20\ m.

Here is $x$ and $a + y$ and $y$. Here is $a and $b as variables and $20 + $30 as currency.

``` latex
x
```

Here are some `{py}code` blocs with `{r} custom `  with `{code} format `.

---
> id: step3

Here is another section

<div class="row">
  Here is HTML that contains __bold__ and [[blanks|text]].
  <div>Also, _nested_ HTML!</div>
</div>
<div>More [link](url) text</div>

* {.item1} list item 
* {.item2} list item with _italic_ and [[blanks|gaps]]

---
> id: step4

Here are PUG includes

    include include.svg

and PUG code

    .row

---
> id: step5

Here is a table

| a | b |
| - | - |
| c | d |
{.table-class}

And a table without header

| a | b |
| c | d |
{.table-class}

---
> id: step6

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
> id: step7

::: column(width=410)
Right Triangle: When a triangle has one right angle.
::: column.grow
Obtuse Triangle: When a triangle has one obtuse angle.
::: column
Acute Triangle: When all three angles in the triangle are acute.
:::

Here is a paragraph

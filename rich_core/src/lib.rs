use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyModule};
use serde::Serialize;
use serde_json::{json, Value};

const MAX_HTML_NESTING: usize = 256;
const MAX_PY_CONVERSION_DEPTH: usize = MAX_HTML_NESTING + 16;

type CoreResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize)]
struct Marker {
    start: usize,
    end: usize,
    marker: String,
    title: String,
    button_type: String,
    value: String,
    color: Option<String>,
    audience: String,
}

fn color_alias(value: &str) -> Option<&'static str> {
    match value.trim().to_lowercase().as_str() {
        "r" | "red" | "أحمر" | "احمر" => Some("r"),
        "b" | "blue" | "أزرق" | "ازرق" => Some("b"),
        "p" | "primary" => Some("p"),
        "g" | "green" | "أخضر" | "اخضر" => Some("g"),
        _ => None,
    }
}

fn audience_alias(value: &str) -> Option<&'static str> {
    match value.trim().to_lowercase().as_str() {
        "all" | "public" | "عام" => Some("all"),
        "sub" | "subs" | "members" | "مشتركين" => Some("subscribers"),
        _ => None,
    }
}

fn normalize_button_type(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "link" => "url".to_string(),
        "callback" => "callback_data".to_string(),
        "alert" => "popup".to_string(),
        "webapp" => "web_app".to_string(),
        "login" => "login_url".to_string(),
        "inline" => "switch_inline_query".to_string(),
        "current" => "switch_inline_query_current_chat".to_string(),
        "cbd" | "page" => "page_callback".to_string(),
        "inline-here" => "switch_inline_query_current_chat".to_string(),
        "callbackdata" | "callback data" => "callback_data".to_string(),
        "web app" => "web_app".to_string(),
        "login url" => "login_url".to_string(),
        "switch inline query" => "switch_inline_query".to_string(),
        "switch inline query current chat" => "switch_inline_query_current_chat".to_string(),
        other => other.to_string(),
    }
}

fn is_button_type(value: &str) -> bool {
    matches!(
        value,
        "user"
            | "disabled"
            | "url"
            | "callback_data"
            | "page_callback"
            | "copy"
            | "popup"
            | "web_app"
            | "login_url"
            | "switch_inline_query"
            | "switch_inline_query_current_chat"
    )
}

fn valid_typed_name(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    let mut saw_token = false;
    let mut in_token = false;
    for ch in trimmed.chars() {
        if ch.is_whitespace() {
            if in_token {
                saw_token = true;
                in_token = false;
            }
            continue;
        }
        if ch.is_alphanumeric() || ch == '_' || ch == '-' {
            in_token = true;
            continue;
        }
        return false;
    }
    saw_token || in_token
}

fn split_first_word(value: &str) -> (&str, &str) {
    let trimmed = value.trim();
    for (index, ch) in trimmed.char_indices() {
        if ch.is_whitespace() {
            return (&trimmed[..index], trimmed[index..].trim());
        }
    }
    (trimmed, "")
}

fn trailing_word(value: &str) -> Option<(&str, &str)> {
    let trimmed = value.trim_end();
    for (index, ch) in trimmed.char_indices().rev() {
        if ch.is_whitespace() {
            let token = trimmed[index..].trim();
            if !token.is_empty() {
                return Some((trimmed[..index].trim_end(), token));
            }
        }
    }
    None
}

fn parse_marker_parts(marker: &str) -> Option<(String, String, String, Option<String>, String)> {
    if !marker.starts_with('{') || !marker.ends_with('}') {
        return None;
    }
    let body = marker[1..marker.len() - 1].trim();
    let hyphen_index = body.find('-');
    let colon_index = body.find(':');
    let new_syntax = match hyphen_index {
        Some(hyphen) => colon_index.map_or(true, |colon| hyphen < colon),
        None => false,
    };

    let (title, raw_specification) = if new_syntax {
        let index = hyphen_index?;
        (&body[..index], &body[index + 1..])
    } else if let Some(index) = colon_index {
        (&body[..index], &body[index + 1..])
    } else {
        return None;
    };

    let title = title.trim();
    let mut specification = raw_specification.trim().to_string();
    if title.is_empty() || title.chars().count() > 64 || specification.is_empty() {
        return None;
    }

    let mut audience = "all".to_string();
    let mut color: Option<String> = None;

    loop {
        let trimmed = specification.trim_end().to_string();

        if let Some(hash_index) = trimmed.rfind('#') {
            let suffix = trimmed[hash_index + 1..].trim();
            if suffix.chars().count() == 1 {
                if let Some(alias) = color_alias(suffix) {
                    color = Some(alias.to_string());
                    specification = trimmed[..hash_index].trim_end().to_string();
                    continue;
                }
            }
        }

        if let Some(dash_index) = trimmed.rfind('-') {
            let suffix = trimmed[dash_index + 1..].trim();
            let simple_token = !suffix.is_empty()
                && !suffix.chars().any(|ch| ch.is_whitespace() || ch == '-');
            if simple_token {
                if let Some(alias) = color_alias(suffix) {
                    color = Some(alias.to_string());
                    specification = trimmed[..dash_index].trim_end().to_string();
                    continue;
                }
                if let Some(alias) = audience_alias(suffix) {
                    audience = alias.to_string();
                    specification = trimmed[..dash_index].trim_end().to_string();
                    continue;
                }
            }
        }

        if let Some((prefix, suffix)) = trailing_word(&trimmed) {
            if let Some(alias) = audience_alias(suffix) {
                audience = alias.to_string();
                specification = prefix.to_string();
                continue;
            }
        }

        specification = trimmed;
        break;
    }

    let mut typed: Option<(String, String)> = None;
    if let Some(index) = specification.find(':') {
        let name = specification[..index].trim();
        if valid_typed_name(name) {
            let normalized = normalize_button_type(name);
            if is_button_type(&normalized) {
                typed = Some((normalized, specification[index + 1..].trim().to_string()));
            }
        }
    }

    let (button_type, value) = if let Some(value) = typed {
        value
    } else if new_syntax {
        let normalized = normalize_button_type(&specification);
        if is_button_type(&normalized) {
            (normalized, String::new())
        } else {
            ("url".to_string(), specification.trim().to_string())
        }
    } else {
        let (raw_type, value) = split_first_word(&specification);
        (normalize_button_type(raw_type), value.to_string())
    };

    Some((
        title.to_string(),
        button_type,
        value,
        color,
        audience,
    ))
}

fn parse_inline_markers(text: &str) -> Vec<Marker> {
    // One streaming pass keeps memory proportional to the number of matches,
    // rather than allocating a (byte, char) entry for every character in 32K text.
    let mut markers = Vec::new();
    let mut candidate: Option<(usize, usize)> = None;

    for (char_index, (byte_index, ch)) in text.char_indices().enumerate() {
        match ch {
            '{' => candidate = Some((byte_index, char_index)),
            '\n' => candidate = None,
            '}' => {
                let Some((byte_start, char_start)) = candidate.take() else {
                    continue;
                };
                if char_index <= char_start + 1 {
                    continue;
                }
                let byte_end = byte_index + ch.len_utf8();
                let marker = &text[byte_start..byte_end];
                if let Some((title, button_type, value, color, audience)) =
                    parse_marker_parts(marker)
                {
                    markers.push(Marker {
                        start: char_start,
                        end: char_index + 1,
                        marker: marker.to_string(),
                        title,
                        button_type,
                        value,
                        color,
                        audience,
                    });
                }
            }
            _ => {}
        }
    }

    markers
}

#[derive(Debug, Clone, Default)]
struct TagAttrs {
    href: Option<String>,
    emoji_id: Option<String>,
}

#[derive(Debug, Clone)]
struct Frame {
    tag: String,
    attrs: TagAttrs,
    parts: Vec<Value>,
}

impl Frame {
    fn root() -> Self {
        Self {
            tag: "root".to_string(),
            attrs: TagAttrs::default(),
            parts: Vec::with_capacity(8),
        }
    }
}

#[derive(Debug)]
struct TagToken {
    name: String,
    attrs: TagAttrs,
    closing: bool,
    self_closing: bool,
}

fn next_char(value: &str, index: usize) -> CoreResult<char> {
    value
        .get(index..)
        .and_then(|slice| slice.chars().next())
        .ok_or_else(|| format!("invalid UTF-8 boundary at byte {index}"))
}

fn skip_whitespace(value: &str, mut index: usize) -> CoreResult<usize> {
    while index < value.len() {
        let ch = next_char(value, index)?;
        if !ch.is_whitespace() {
            break;
        }
        index += ch.len_utf8();
    }
    Ok(index)
}

fn parse_attributes(value: &str) -> CoreResult<TagAttrs> {
    // RichText conversion only consumes href and emoji-id. Keeping a fixed
    // attribute struct avoids a HashMap allocation for every tag in wide trees.
    let mut attrs = TagAttrs::default();
    let mut index = 0;

    while index < value.len() {
        index = skip_whitespace(value, index)?;
        if index >= value.len() {
            break;
        }

        let first = next_char(value, index)?;
        if first == '/' {
            break;
        }

        let key_start = index;
        while index < value.len() {
            let ch = next_char(value, index)?;
            if ch.is_whitespace() || ch == '=' || ch == '/' {
                break;
            }
            index += ch.len_utf8();
        }
        if key_start == index {
            index += first.len_utf8();
            continue;
        }
        let key = &value[key_start..index];
        index = skip_whitespace(value, index)?;

        let mut raw_value = "";
        if index < value.len() && value[index..].starts_with('=') {
            index += 1;
            index = skip_whitespace(value, index)?;
            if index < value.len() {
                let quote = next_char(value, index)?;
                if quote == '"' || quote == '\'' {
                    index += quote.len_utf8();
                    let content_start = index;
                    while index < value.len() {
                        let ch = next_char(value, index)?;
                        if ch == quote {
                            break;
                        }
                        index += ch.len_utf8();
                    }
                    if index >= value.len() {
                        return Err("unterminated quoted HTML attribute".to_string());
                    }
                    raw_value = &value[content_start..index];
                    index += quote.len_utf8();
                } else {
                    let content_start = index;
                    while index < value.len() {
                        let ch = next_char(value, index)?;
                        if ch.is_whitespace() {
                            break;
                        }
                        index += ch.len_utf8();
                    }
                    raw_value = &value[content_start..index];
                }
            }
        }

        if key.eq_ignore_ascii_case("href") {
            attrs.href = Some(html_escape::decode_html_entities(raw_value).into_owned());
        } else if key.eq_ignore_ascii_case("emoji-id") {
            attrs.emoji_id = Some(html_escape::decode_html_entities(raw_value).into_owned());
        }
    }

    Ok(attrs)
}

fn parse_tag(raw: &str) -> CoreResult<Option<TagToken>> {
    let mut value = raw.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.starts_with('!') || value.starts_with('?') {
        return Err("HTML declaration/comment requires Python fallback".to_string());
    }

    let closing = value.starts_with('/');
    if closing {
        value = value[1..].trim_start();
    }
    let Some(first_name_char) = value.chars().next() else {
        return Ok(None);
    };
    if !first_name_char.is_ascii_alphabetic() {
        return Err("ambiguous HTML-like text requires Python fallback".to_string());
    }

    let mut self_closing = false;
    if !closing && value.ends_with('/') {
        let slash_index = value.len() - 1;
        let before_slash = value[..slash_index].chars().next_back();
        let has_attributes = value[..slash_index].chars().any(char::is_whitespace);
        let unambiguous = !has_attributes
            || before_slash.is_some_and(|ch| ch.is_whitespace() || ch == '"' || ch == '\'');
        if !unambiguous {
            // Python HTMLParser treats <a href=x/> as href="x/", not a self-closing tag.
            // Falling back avoids silently changing the URL or wrapper lifetime.
            return Err("ambiguous self-closing HTML tag requires Python fallback".to_string());
        }
        self_closing = true;
        value = value[..slash_index].trim_end();
    }

    let mut name_end = value.len();
    for (index, ch) in value.char_indices() {
        if ch.is_whitespace() || ch == '/' {
            name_end = index;
            break;
        }
    }
    let name = value[..name_end].trim().to_ascii_lowercase();
    if name.is_empty() {
        return Ok(None);
    }
    let attrs = if closing {
        TagAttrs::default()
    } else {
        parse_attributes(&value[name_end..])?
    };

    Ok(Some(TagToken {
        name,
        attrs,
        closing,
        self_closing,
    }))
}

fn find_tag_end(input: &str, start: usize) -> CoreResult<usize> {
    let Some(rest) = input.get(start + 1..) else {
        return Err("invalid HTML tag boundary".to_string());
    };
    let mut quote: Option<char> = None;
    for (relative, ch) in rest.char_indices() {
        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            '>' => return Ok(start + 1 + relative),
            _ => {}
        }
    }
    Err("unterminated HTML tag requires Python fallback".to_string())
}

fn compact_content(mut parts: Vec<Value>) -> Value {
    // retain() is a single linear pass and reuses the existing allocation.
    parts.retain(|part| match part {
        Value::Null => false,
        Value::String(value) => !value.is_empty(),
        Value::Array(value) => !value.is_empty(),
        _ => true,
    });

    match parts.len() {
        0 => Value::String(String::new()),
        1 => parts.pop().unwrap_or_else(|| Value::String(String::new())),
        _ => Value::Array(parts),
    }
}

fn plain_rich_text(value: &Value) -> String {
    // Iterative traversal avoids Rust stack growth when RichText wrappers are
    // deeply nested. Arrays are pushed in reverse to preserve exact order.
    let mut output = String::new();
    let mut stack = vec![value];
    while let Some(current) = stack.pop() {
        match current {
            Value::String(text) => output.push_str(text),
            Value::Array(values) => {
                for child in values.iter().rev() {
                    stack.push(child);
                }
            }
            Value::Object(values) => {
                if let Some(child) = values
                    .get("text")
                    .or_else(|| values.get("alternative_text"))
                {
                    stack.push(child);
                }
            }
            Value::Null => {}
            other => output.push_str(&other.to_string()),
        }
    }
    output
}

fn wrapper_type(tag: &str) -> Option<&'static str> {
    match tag {
        "b" | "strong" => Some("bold"),
        "i" | "em" => Some("italic"),
        "u" | "ins" => Some("underline"),
        "s" | "strike" | "del" => Some("strikethrough"),
        "tg-spoiler" => Some("spoiler"),
        "code" => Some("code"),
        "mark" => Some("marked"),
        "sub" => Some("subscript"),
        "sup" => Some("superscript"),
        _ => None,
    }
}

fn close_frame(stack: &mut Vec<Frame>, tag: &str) -> CoreResult<()> {
    if stack.len() == 1 {
        return Ok(());
    }

    let Some(frame) = stack.pop() else {
        return Err("HTML frame stack unexpectedly empty".to_string());
    };
    let Some(parent) = stack.last_mut() else {
        return Err("HTML frame stack lost its root frame".to_string());
    };

    if frame.tag != tag {
        // Intentional parity with renderer.py::_RichTextHTMLParser.handle_endtag:
        // Python pops exactly one frame on a mismatched closing tag, discards
        // that wrapper, and appends its children to the parent unchanged.
        parent.parts.extend(frame.parts);
        return Ok(());
    }

    let content = compact_content(frame.parts);
    let empty = Value::String(String::new());
    let wrapped = if let Some(rich_type) = wrapper_type(tag) {
        if content == empty {
            content
        } else {
            json!({"type": rich_type, "text": content})
        }
    } else if tag == "a" && content != empty {
        let href = frame.attrs.href.unwrap_or_default();
        if let Some(address) = href.strip_prefix("mailto:") {
            json!({"type": "email_address", "text": content, "email_address": address})
        } else if let Some(number) = href.strip_prefix("tel:") {
            json!({"type": "phone_number", "text": content, "phone_number": number})
        } else if let Some(anchor_name) = href.strip_prefix('#') {
            json!({"type": "anchor_link", "text": content, "anchor_name": anchor_name})
        } else if !href.is_empty() {
            json!({"type": "url", "text": content, "url": href})
        } else {
            content
        }
    } else if tag == "tg-emoji" {
        let emoji_id = frame.attrs.emoji_id.unwrap_or_default();
        if emoji_id.is_empty() {
            content
        } else {
            let alternative = plain_rich_text(&content);
            json!({
                "type": "custom_emoji",
                "custom_emoji_id": emoji_id,
                "alternative_text": if alternative.is_empty() { "🙂".to_string() } else { alternative },
            })
        }
    } else {
        content
    };

    parent.parts.push(wrapped);
    Ok(())
}

fn append_text(stack: &mut [Frame], value: &str) -> CoreResult<()> {
    if value.is_empty() {
        return Ok(());
    }
    let decoded = html_escape::decode_html_entities(value).into_owned();
    if decoded.is_empty() {
        return Ok(());
    }
    let Some(frame) = stack.last_mut() else {
        return Err("HTML frame stack unexpectedly empty".to_string());
    };
    frame.parts.push(Value::String(decoded));
    Ok(())
}

fn html_to_rich_value(input: &str) -> CoreResult<Value> {
    let mut stack = vec![Frame::root()];
    let mut cursor = 0;

    while cursor < input.len() {
        let Some(relative_start) = input[cursor..].find('<') else {
            append_text(&mut stack, &input[cursor..])?;
            break;
        };
        let start = cursor + relative_start;
        append_text(&mut stack, &input[cursor..start])?;

        let end = find_tag_end(input, start)?;
        let raw = &input[start + 1..end];

        if let Some(tag) = parse_tag(raw)? {
            if tag.closing {
                close_frame(&mut stack, &tag.name)?;
            } else if tag.name == "br" {
                let Some(frame) = stack.last_mut() else {
                    return Err("HTML frame stack unexpectedly empty".to_string());
                };
                frame.parts.push(Value::String("\n".to_string()));
            } else {
                if stack.len() >= MAX_HTML_NESTING {
                    return Err(format!(
                        "HTML nesting exceeds native safety limit ({MAX_HTML_NESTING})"
                    ));
                }
                let name = tag.name.clone();
                stack.push(Frame {
                    tag: tag.name,
                    attrs: tag.attrs,
                    parts: Vec::with_capacity(4),
                });
                if tag.self_closing {
                    close_frame(&mut stack, &name)?;
                }
            }
        }
        cursor = end + 1;
    }

    while stack.len() > 1 {
        let Some(frame) = stack.last() else {
            return Err("HTML frame stack unexpectedly empty".to_string());
        };
        let tag = frame.tag.clone();
        close_frame(&mut stack, &tag)?;
    }

    let Some(root) = stack.pop() else {
        return Err("HTML frame stack lost its root frame".to_string());
    };
    Ok(compact_content(root.parts))
}

fn value_to_py(py: Python<'_>, value: &Value, depth: usize) -> PyResult<PyObject> {
    if depth > MAX_PY_CONVERSION_DEPTH {
        return Err(PyValueError::new_err(
            "native RichText conversion exceeded the safe Python-object depth",
        ));
    }
    match value {
        Value::Null => Ok(py.None()),
        Value::Bool(value) => Ok(value.into_py(py)),
        Value::Number(value) => {
            if let Some(number) = value.as_i64() {
                Ok(number.into_py(py))
            } else if let Some(number) = value.as_u64() {
                Ok(number.into_py(py))
            } else if let Some(number) = value.as_f64() {
                Ok(number.into_py(py))
            } else {
                Err(PyValueError::new_err("unsupported JSON number"))
            }
        }
        Value::String(value) => Ok(value.into_py(py)),
        Value::Array(values) => {
            let list = PyList::empty_bound(py);
            for item in values {
                list.append(value_to_py(py, item, depth + 1)?)?;
            }
            Ok(list.into_py(py))
        }
        Value::Object(values) => {
            let dict = PyDict::new_bound(py);
            for (key, item) in values {
                dict.set_item(key, value_to_py(py, item, depth + 1)?)?;
            }
            Ok(dict.into_py(py))
        }
    }
}

fn py_core_error(error: String) -> PyErr {
    PyValueError::new_err(error)
}

fn json_string<T: Serialize>(value: &T) -> PyResult<String> {
    serde_json::to_string(value).map_err(|error| PyValueError::new_err(error.to_string()))
}

#[pyfunction(name = "parse_inline_markers")]
fn py_parse_inline_markers(py: Python<'_>, text: &str) -> PyResult<PyObject> {
    let value = serde_json::to_value(parse_inline_markers(text))
        .map_err(|error| PyValueError::new_err(error.to_string()))?;
    value_to_py(py, &value, 0)
}

#[pyfunction(name = "html_to_rich")]
fn py_html_to_rich(py: Python<'_>, html: &str) -> PyResult<PyObject> {
    let value = html_to_rich_value(html).map_err(py_core_error)?;
    value_to_py(py, &value, 0)
}

// Kept only for benchmark/backward comparison. Production Python code calls
// the direct object-returning functions above and avoids a JSON string round-trip.
#[pyfunction]
fn parse_inline_markers_json(text: &str) -> PyResult<String> {
    json_string(&parse_inline_markers(text))
}

#[pyfunction]
fn html_to_rich_json(html: &str) -> PyResult<String> {
    let value = html_to_rich_value(html).map_err(py_core_error)?;
    json_string(&value)
}

#[pymodule]
fn rich_core_native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(py_parse_inline_markers, module)?)?;
    module.add_function(wrap_pyfunction!(py_html_to_rich, module)?)?;
    module.add_function(wrap_pyfunction!(parse_inline_markers_json, module)?)?;
    module.add_function(wrap_pyfunction!(html_to_rich_json, module)?)?;
    module.add("MAX_HTML_NESTING", MAX_HTML_NESTING)?;
    module.add("__version__", env!("CARGO_PKG_VERSION"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mismatched_close_matches_python_fallback_contract() {
        let parsed = html_to_rich_value("<b><i>x</b>y</i>");
        assert_eq!(parsed, Ok(json!(["x", "y"])));
    }

    #[test]
    fn quoted_gt_inside_href_is_not_mistaken_for_tag_end() {
        let parsed = html_to_rich_value(
            "<a href=\"https://example.com/?q=a>b\">x</a>",
        );
        assert_eq!(
            parsed,
            Ok(json!({
                "type": "url",
                "text": "x",
                "url": "https://example.com/?q=a>b"
            }))
        );
    }

    #[test]
    fn unquoted_href_keeps_url_slashes() {
        let parsed = html_to_rich_value("<a href=https://example.com/a/b>x</a>");
        assert_eq!(
            parsed,
            Ok(json!({
                "type": "url",
                "text": "x",
                "url": "https://example.com/a/b"
            }))
        );
    }

    #[test]
    fn ambiguous_unquoted_self_close_uses_fallback() {
        let parsed = html_to_rich_value("<a href=https://example.com/>x</a>");
        assert!(parsed.is_err());
    }

    #[test]
    fn malformed_or_declaration_html_uses_fallback() {
        assert!(html_to_rich_value("x<b").is_err());
        assert!(html_to_rich_value("<!-- comment > still comment -->x").is_err());
        assert!(html_to_rich_value("x<3>y").is_err());
    }

    #[test]
    fn deep_rich_text_above_realistic_depth_is_safe() {
        let depth = 64;
        let mut html = "<b>".repeat(depth);
        html.push('x');
        html.push_str(&"</b>".repeat(depth));
        let parsed = html_to_rich_value(&html);
        assert!(parsed.is_ok());

        let mut current = match parsed {
            Ok(value) => value,
            Err(error) => panic!("unexpected parse failure: {error}"),
        };
        let mut seen = 0;
        loop {
            let Value::Object(map) = current else {
                break;
            };
            let Some(next) = map.get("text").cloned() else {
                break;
            };
            seen += 1;
            current = next;
        }
        assert_eq!(seen, depth);
        assert_eq!(current, Value::String("x".to_string()));
    }

    #[test]
    fn excessive_nesting_returns_error_instead_of_panicking() {
        let depth = MAX_HTML_NESTING + 20;
        let mut html = "<b>".repeat(depth);
        html.push('x');
        html.push_str(&"</b>".repeat(depth));
        let parsed = html_to_rich_value(&html);
        assert!(parsed.is_err());
    }

    #[test]
    fn plain_text_extraction_is_iterative_for_deep_values() {
        let mut value = Value::String("x".to_string());
        for _ in 0..128 {
            value = json!({"type": "bold", "text": value});
        }
        assert_eq!(plain_rich_text(&value), "x");
    }

    #[test]
    fn wide_sibling_order_is_preserved() {
        let html = (0..50)
            .map(|index| format!("<b>{index}</b>"))
            .collect::<String>();
        let parsed = html_to_rich_value(&html);
        let Ok(Value::Array(items)) = parsed else {
            panic!("wide payload did not produce an array");
        };
        assert_eq!(items.len(), 50);
        for (index, item) in items.iter().enumerate() {
            assert_eq!(item, &json!({"type": "bold", "text": index.to_string()}));
        }
    }

    #[test]
    fn compact_content_handles_large_width_in_one_linear_retained_vector() {
        let parts = (0..10_000)
            .map(|index| Value::String(index.to_string()))
            .collect::<Vec<_>>();
        let compact = compact_content(parts);
        let Value::Array(items) = compact else {
            panic!("expected wide compact result");
        };
        assert_eq!(items.len(), 10_000);
        assert_eq!(items.first(), Some(&Value::String("0".to_string())));
        assert_eq!(
            items.last(),
            Some(&Value::String("9999".to_string()))
        );
    }

    #[test]
    fn marker_scan_preserves_fifty_sibling_markers() {
        let source = (0..50)
            .map(|index| format!("{{زر {index} - callback_data: action:{index}}}"))
            .collect::<Vec<_>>()
            .join(" ");
        let markers = parse_inline_markers(&source);
        assert_eq!(markers.len(), 50);
        for (index, marker) in markers.iter().enumerate() {
            assert_eq!(marker.title, format!("زر {index}"));
            assert_eq!(marker.value, format!("action:{index}"));
        }
    }

    #[test]
    fn marker_scan_resets_to_inner_open_brace_like_python_regex() {
        let markers = parse_inline_markers("prefix {bad {ok - callback_data: yes} suffix");
        assert_eq!(markers.len(), 1);
        assert_eq!(markers[0].title, "ok");
        assert_eq!(markers[0].value, "yes");
    }
}

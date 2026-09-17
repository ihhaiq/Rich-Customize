use std::collections::HashMap;

use html_escape::decode_html_entities;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use serde::Serialize;
use serde_json::{json, Value};

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
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut markers = Vec::new();
    let mut index = 0;

    while index < chars.len() {
        if chars[index].1 != '{' {
            index += 1;
            continue;
        }

        let mut cursor = index + 1;
        let mut close_index = None;
        let mut invalid = false;
        while cursor < chars.len() {
            match chars[cursor].1 {
                '{' | '\n' => {
                    invalid = true;
                    break;
                }
                '}' => {
                    close_index = Some(cursor);
                    break;
                }
                _ => cursor += 1,
            }
        }

        if invalid || close_index.is_none() {
            index += 1;
            continue;
        }

        let close_index = close_index.expect("checked above");
        if close_index == index + 1 {
            index = close_index + 1;
            continue;
        }

        let byte_start = chars[index].0;
        let byte_end = if close_index + 1 < chars.len() {
            chars[close_index + 1].0
        } else {
            text.len()
        };
        let marker = &text[byte_start..byte_end];
        if let Some((title, button_type, value, color, audience)) = parse_marker_parts(marker) {
            markers.push(Marker {
                start: index,
                end: close_index + 1,
                marker: marker.to_string(),
                title,
                button_type,
                value,
                color,
                audience,
            });
        }
        index = close_index + 1;
    }

    markers
}

#[derive(Debug, Clone)]
struct Frame {
    tag: String,
    attrs: HashMap<String, String>,
    parts: Vec<Value>,
}

impl Frame {
    fn root() -> Self {
        Self {
            tag: "root".to_string(),
            attrs: HashMap::new(),
            parts: Vec::new(),
        }
    }
}

#[derive(Debug)]
struct TagToken {
    name: String,
    attrs: HashMap<String, String>,
    closing: bool,
    self_closing: bool,
}

fn skip_whitespace(value: &str, mut index: usize) -> usize {
    while index < value.len() {
        let ch = value[index..].chars().next().expect("valid boundary");
        if !ch.is_whitespace() {
            break;
        }
        index += ch.len_utf8();
    }
    index
}

fn parse_attributes(value: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    let mut index = 0;

    while index < value.len() {
        index = skip_whitespace(value, index);
        if index >= value.len() {
            break;
        }

        let key_start = index;
        while index < value.len() {
            let ch = value[index..].chars().next().expect("valid boundary");
            if ch.is_whitespace() || ch == '=' || ch == '/' {
                break;
            }
            index += ch.len_utf8();
        }
        if key_start == index {
            index += value[index..]
                .chars()
                .next()
                .expect("valid boundary")
                .len_utf8();
            continue;
        }
        let key = value[key_start..index].to_lowercase();
        index = skip_whitespace(value, index);

        let mut attr_value = String::new();
        if index < value.len() && value[index..].starts_with('=') {
            index += 1;
            index = skip_whitespace(value, index);
            if index < value.len() {
                let first = value[index..].chars().next().expect("valid boundary");
                if first == '"' || first == '\'' {
                    index += first.len_utf8();
                    let content_start = index;
                    while index < value.len() {
                        let ch = value[index..].chars().next().expect("valid boundary");
                        if ch == first {
                            break;
                        }
                        index += ch.len_utf8();
                    }
                    attr_value = decode_html_entities(&value[content_start..index]).into_owned();
                    if index < value.len() {
                        index += first.len_utf8();
                    }
                } else {
                    let content_start = index;
                    while index < value.len() {
                        let ch = value[index..].chars().next().expect("valid boundary");
                        if ch.is_whitespace() || ch == '/' {
                            break;
                        }
                        index += ch.len_utf8();
                    }
                    attr_value = decode_html_entities(&value[content_start..index]).into_owned();
                }
            }
        }
        attrs.insert(key, attr_value);
    }

    attrs
}

fn parse_tag(raw: &str) -> Option<TagToken> {
    let mut value = raw.trim();
    if value.is_empty() || value.starts_with('!') || value.starts_with('?') {
        return None;
    }

    let closing = value.starts_with('/');
    if closing {
        value = value[1..].trim_start();
    }

    let self_closing = !closing && value.ends_with('/');
    if self_closing {
        value = value[..value.len() - 1].trim_end();
    }

    let mut name_end = value.len();
    for (index, ch) in value.char_indices() {
        if ch.is_whitespace() || ch == '/' {
            name_end = index;
            break;
        }
    }
    let name = value[..name_end].trim().to_lowercase();
    if name.is_empty() {
        return None;
    }
    let attrs = if closing {
        HashMap::new()
    } else {
        parse_attributes(&value[name_end..])
    };

    Some(TagToken {
        name,
        attrs,
        closing,
        self_closing,
    })
}

fn compact_content(parts: Vec<Value>) -> Value {
    let mut compact: Vec<Value> = parts
        .into_iter()
        .filter(|part| match part {
            Value::Null => false,
            Value::String(value) => !value.is_empty(),
            Value::Array(value) => !value.is_empty(),
            _ => true,
        })
        .collect();

    match compact.len() {
        0 => Value::String(String::new()),
        1 => compact.pop().expect("length checked"),
        _ => Value::Array(compact),
    }
}

fn plain_rich_text(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Array(values) => values.iter().map(plain_rich_text).collect(),
        Value::Object(values) => values
            .get("text")
            .or_else(|| values.get("alternative_text"))
            .map(plain_rich_text)
            .unwrap_or_default(),
        Value::Null => String::new(),
        _ => value.to_string(),
    }
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

fn close_frame(stack: &mut Vec<Frame>, tag: &str) {
    if stack.len() == 1 {
        return;
    }

    let frame = stack.pop().expect("root retained");
    if frame.tag != tag {
        stack
            .last_mut()
            .expect("root retained")
            .parts
            .extend(frame.parts);
        return;
    }

    let content = compact_content(frame.parts);
    let wrapped = if let Some(rich_type) = wrapper_type(tag) {
        if content == Value::String(String::new()) {
            content
        } else {
            json!({"type": rich_type, "text": content})
        }
    } else if tag == "a" && content != Value::String(String::new()) {
        let href = frame.attrs.get("href").cloned().unwrap_or_default();
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
        let emoji_id = frame.attrs.get("emoji-id").cloned().unwrap_or_default();
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

    stack
        .last_mut()
        .expect("root retained")
        .parts
        .push(wrapped);
}

fn append_text(stack: &mut [Frame], value: &str) {
    if value.is_empty() {
        return;
    }
    let decoded = decode_html_entities(value).into_owned();
    if decoded.is_empty() {
        return;
    }
    stack
        .last_mut()
        .expect("root retained")
        .parts
        .push(Value::String(decoded));
}

fn html_to_rich_value(input: &str) -> Value {
    let mut stack = vec![Frame::root()];
    let mut cursor = 0;

    while cursor < input.len() {
        let Some(relative_start) = input[cursor..].find('<') else {
            append_text(&mut stack, &input[cursor..]);
            break;
        };
        let start = cursor + relative_start;
        append_text(&mut stack, &input[cursor..start]);

        let Some(relative_end) = input[start + 1..].find('>') else {
            append_text(&mut stack, &input[start..]);
            break;
        };
        let end = start + 1 + relative_end;
        let raw = &input[start + 1..end];

        if let Some(tag) = parse_tag(raw) {
            if tag.closing {
                close_frame(&mut stack, &tag.name);
            } else if tag.name == "br" {
                stack
                    .last_mut()
                    .expect("root retained")
                    .parts
                    .push(Value::String("\n".to_string()));
            } else {
                let name = tag.name.clone();
                stack.push(Frame {
                    tag: tag.name,
                    attrs: tag.attrs,
                    parts: Vec::new(),
                });
                if tag.self_closing {
                    close_frame(&mut stack, &name);
                }
            }
        }
        cursor = end + 1;
    }

    while stack.len() > 1 {
        let tag = stack.last().expect("root retained").tag.clone();
        close_frame(&mut stack, &tag);
    }

    compact_content(stack.pop().expect("root exists").parts)
}

fn json_string<T: Serialize>(value: &T) -> PyResult<String> {
    serde_json::to_string(value).map_err(|error| PyValueError::new_err(error.to_string()))
}

#[pyfunction]
fn parse_inline_markers_json(text: &str) -> PyResult<String> {
    json_string(&parse_inline_markers(text))
}

#[pyfunction]
fn html_to_rich_json(html: &str) -> PyResult<String> {
    json_string(&html_to_rich_value(html))
}

#[pymodule]
fn rich_core_native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(parse_inline_markers_json, module)?)?;
    module.add_function(wrap_pyfunction!(html_to_rich_json, module)?)?;
    module.add("__version__", env!("CARGO_PKG_VERSION"))?;
    Ok(())
}

--[[
okimate.lua — pandoc filter that prints images (and text) through Okifake.

  ![Caption](screen.png){.okimate}
  ![Caption](photo.jpg){.okimate model=oki20 pixels=0 paper=copier print-width=3}

  ```{.okimate ribbon=black}
  10 PRINT "HELLO"
  20 GOTO 10
  ```

An image with the `okimate` class is rendered as an Okimate printout. A code
block with the class prints its text in the Okimate 10's font ({red}, {blue}…
tags switch ribbon colors). Attributes are Okifake settings in kebab-case;
pandoc's own `width` / `height` still set the size on the page. Without them
the printout appears at its true printed size.

Document-wide settings go in the YAML front matter:

  okimate:
    all: true            # print every image, not only .okimate ones
    paper: copier
    age: 0.2

Use `{.no-okimate}` to leave one image alone when `all` is on.

The printout's paper takes the page color given by `okimate-page-color`
(e.g. -M okimate-page-color=#FCF9F0), with flat paper texture, so it looks
printed on the page itself. Set `paper-color` / `paper-shade` to override.

Rendered PNGs are cached in `.okimate-cache/` next to the input file.
Environment: OKIFAKE_CLI (path to cli/okifake.mjs), OKIFAKE_NODE (node binary).
]]

local path = pandoc.path
local system = pandoc.system

local NOT_OPTIONS = { width = true, height = true, style = true, alt = true, title = true }

local function script_dir()
  local f = PANDOC_SCRIPT_FILE or ''
  return path.directory(f)
end

local function file_exists(p)
  local fh = io.open(p, 'rb')
  if fh then fh:close() return true end
  return false
end

local function find_cli()
  local env = os.getenv('OKIFAKE_CLI')
  if env and env ~= '' then return env end
  local here = path.join({ script_dir(), '..', '..', 'cli', 'okifake.mjs' })
  if file_exists(here) then return here end
  local home = os.getenv('HOME') or ''
  return path.join({ home, 'Documents', 'github', 'okifake', 'cli', 'okifake.mjs' })
end

local CLI = find_cli()
local NODE = os.getenv('OKIFAKE_NODE') or 'node'

local input_dir = '.'
if PANDOC_STATE and PANDOC_STATE.input_files and PANDOC_STATE.input_files[1]
    and PANDOC_STATE.input_files[1] ~= '-' then
  input_dir = path.directory(PANDOC_STATE.input_files[1])
end
local cache_dir = path.join({ input_dir, '.okimate-cache' })

local defaults = {}   -- from metadata
local convert_all = false

local function meta_value(v)
  if type(v) == 'table' and v.t == nil and #v == 0 then return nil end
  if type(v) == 'boolean' or type(v) == 'number' then return tostring(v) end
  return pandoc.utils.stringify(v)
end

local function read_meta(meta)
  local m = meta.okimate
  if m == nil then
    -- nothing
  elseif type(m) == 'boolean' then
    convert_all = m
  elseif pandoc.utils.type(m) == 'Inlines' or type(m) == 'string' then
    convert_all = pandoc.utils.stringify(m) == 'all'
  else
    for k, v in pairs(m) do
      if k == 'all' then
        convert_all = (v == true) or (meta_value(v) == 'true')
      else
        defaults[k] = meta_value(v)
      end
    end
  end
  local page = meta['okimate-page-color']
  if page and defaults['paper-color'] == nil then
    defaults['paper-color'] = pandoc.utils.stringify(page)
    if defaults['paper-shade'] == nil then defaults['paper-shade'] = '0' end
  end
end

-- Merge document defaults with element attributes into CLI arguments.
local function option_args(attributes)
  local opts, keys = {}, {}
  for k, v in pairs(defaults) do opts[k] = v end
  for k, v in pairs(attributes) do
    if not NOT_OPTIONS[k] and not k:match('^data%-') then opts[k] = v end
  end
  for k in pairs(opts) do keys[#keys + 1] = k end
  table.sort(keys)
  local args, sig = {}, {}
  for _, k in ipairs(keys) do
    args[#args + 1] = k .. '=' .. opts[k]
    sig[#sig + 1] = k .. '=' .. opts[k]
  end
  return args, table.concat(sig, ';')
end

local function resolve_source(src)
  if path.is_absolute(src) and file_exists(src) then return src end
  if file_exists(src) then return src end
  local p = path.join({ input_dir, src })
  if file_exists(p) then return p end
  for _, dir in ipairs(PANDOC_STATE.resource_path or {}) do
    p = path.join({ dir, src })
    if file_exists(p) then return p end
  end
  return nil
end

local function read_all(p)
  local fh = assert(io.open(p, 'rb'))
  local s = fh:read('a'); fh:close(); return s
end

local cli_checked = false
local function run(args)
  if not cli_checked then
    if not file_exists(CLI) then
      error('okimate.lua: Okifake CLI not found at ' .. CLI .. ' (set OKIFAKE_CLI)')
    end
    cli_checked = true
  end
  system.make_directory(cache_dir, true)
  local full = { 'OKIFAKE_QUIET=1', NODE, CLI }
  for _, a in ipairs(args) do full[#full + 1] = a end
  local ok, err = pcall(pandoc.pipe, 'env', full, '')
  if not ok then error('okimate.lua: okifake failed: ' .. tostring(err)) end
end

local function cached(name, key)
  local out = path.join({ cache_dir, name .. '-' .. pandoc.utils.sha1(key):sub(1, 12) .. '.png' })
  return out, file_exists(out)
end

local function has_class(el, c)
  for _, x in ipairs(el.classes) do if x == c then return true end end
  return false
end

local function drop_class(el, c)
  local keep = {}
  for _, x in ipairs(el.classes) do if x ~= c then keep[#keep + 1] = x end end
  el.classes = keep
end

local function Image(img)
  local wanted = has_class(img, 'okimate') or (convert_all and not has_class(img, 'no-okimate'))
  if not wanted or img.src:match('^%a+://') or img.src:match('^data:') then return nil end
  local src = resolve_source(img.src)
  if not src then
    io.stderr:write('okimate.lua: image not found: ' .. img.src .. '\n')
    return nil
  end
  local args, sig = option_args(img.attributes)
  local stem = path.split_extension(path.filename(src))
  local out, hit = cached(stem, read_all(src) .. '\0' .. sig)
  if not hit then
    io.stderr:write('okimate: printing ' .. img.src .. '\n')
    local a = { src, '-o', out }
    for _, x in ipairs(args) do a[#a + 1] = x end
    run(a)
  end
  img.src = out
  drop_class(img, 'okimate')
  for k in pairs(img.attributes) do
    if not NOT_OPTIONS[k] then img.attributes[k] = nil end
  end
  return img
end

local function CodeBlock(cb)
  if not has_class(cb, 'okimate') then return nil end
  local args, sig = option_args(cb.attributes)
  local out, hit = cached('text', cb.text .. '\0' .. sig)
  if not hit then
    io.stderr:write('okimate: printing text block\n')
    local tmp = out .. '.txt'
    local fh = assert(io.open(tmp, 'wb')); fh:write(cb.text); fh:close()
    local a = { '--text-file', tmp, '-o', out }
    for _, x in ipairs(args) do a[#a + 1] = x end
    local ok, err = pcall(run, a)
    os.remove(tmp)
    if not ok then error(err) end
  end
  local attr = pandoc.Attr(cb.identifier, {}, {})
  if cb.attributes.width then attr.attributes.width = cb.attributes.width end
  if cb.attributes.height then attr.attributes.height = cb.attributes.height end
  return pandoc.Para({ pandoc.Image({}, out, '', attr) })
end

return {
  { Meta = function(meta) read_meta(meta) end },
  { Image = Image, CodeBlock = CodeBlock },
}

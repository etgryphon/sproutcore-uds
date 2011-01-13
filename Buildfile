# ==========================================================================
# SCUDS Framework - Buildfile
# copyright (c) 2009 - Evin Grano, and contributors
# ==========================================================================

# This buildfile defines the configurations needed to link together the 
# various frameworks that make up SCUDS.  If you want to override some
# of these settings, you should make changes to your project Buildfile 
# instead.

config :all, 
  :layout         => 'scuds:lib/index.rhtml',
  :test_layout    => 'scuds:lib/test.rhtml',
  :test_required  => ['sproutcore'],
  :debug_required => ['sproutcore']
  
# CORE FRAMEWORKS
config :foundation, :required => []
config :utils, :required => [:foundation]
config :couch_db, :required => [:foundation, :utils]
config :twitter, :required => [:foundation]
config :local, :required => [:foundation]

# SPECIAL THEMES
# These do not require any of the built-in SproutCore frameworks
%w(standard_theme empty_theme).each do |target_name|
  config target_name, 
    :required => [], :test_required => [], :debug_required => []
end

# CONFIGURE THEMES
config :empty_theme, 
  :theme_name => 'empty-theme',
  :test_required  => ['sproutcore/testing'],
  :debug_required => ['sproutcore/debug']

config :standard_theme, 
  :required => :empty_theme, 
  :theme_name => 'sc-theme',
  :test_required  => ['sproutcore/testing'],
  :debug_required => ['sproutcore/debug']
#   

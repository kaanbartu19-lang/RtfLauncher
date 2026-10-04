package com.rtfsmp.rtftab;

import com.google.gson.*;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

public final class RtfTabMarkerPlugin extends JavaPlugin implements Listener {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final Set<String> launcherUsers = Collections.synchronizedSet(new HashSet<>());
    private String apiUrl;

    @Override public void onEnable() {
        saveDefaultConfig();
        apiUrl = getConfig().getString("api-url", "https://rtfsmp-server.onrender.com").replaceAll("/$", "");
        Bukkit.getPluginManager().registerEvents(this, this);
        Bukkit.getScheduler().runTaskTimerAsynchronously(this, this::refresh, 20L, 20L * 30);
        Bukkit.getScheduler().runTask(this, this::refresh);
    }

    @EventHandler public void join(PlayerJoinEvent e) { Bukkit.getScheduler().runTaskLater(this, () -> apply(e.getPlayer()), 20L); }

    private void refresh() {
        try {
            HttpRequest req=HttpRequest.newBuilder(URI.create(apiUrl+"/api/presence")).timeout(Duration.ofSeconds(5)).GET().build();
            String body=http.send(req,HttpResponse.BodyHandlers.ofString()).body();
            JsonObject root=JsonParser.parseString(body).getAsJsonObject();
            Set<String> next=new HashSet<>();
            for(JsonElement el:root.getAsJsonArray("players")) next.add(el.getAsJsonObject().get("uuid").getAsString());
            launcherUsers.clear(); launcherUsers.addAll(next);
            Bukkit.getScheduler().runTask(this, () -> Bukkit.getOnlinePlayers().forEach(this::apply));
        } catch(Exception ignored) {}
    }

    private void apply(Player p) {
        Scoreboard board=Bukkit.getScoreboardManager().getMainScoreboard();
        Team team=board.getTeam("rtf_launcher");
        if(team==null) team=board.registerNewTeam("rtf_launcher");
        team.prefix(Component.text("◆ ", NamedTextColor.AQUA));
        if(launcherUsers.contains(p.getUniqueId().toString())) { if(!team.hasEntry(p.getName())) team.addEntry(p.getName()); }
        else if(team.hasEntry(p.getName())) team.removeEntry(p.getName());
    }
}
